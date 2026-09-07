import { describe, it, expect } from "vitest";
import { parseWappbizInbound, extractButtonPayload } from "../parseInbound";

/**
 * Pins which inbound shapes the WappBiz webhook acts on. Text messages AND
 * interactive/button taps are accepted — a tap surfaces the button id as
 * `text` so classifyWhatsAppCommand routes it deterministically. Unknown
 * `data.type` values are still acked-and-ignored (UNSUPPORTED_TYPE).
 */

const validPayload = {
  type: "incoming_message",
  version: "1.0",
  data: {
    id: "wamid.HBgMOTE4ODUwMzMzMjUwFQIA",
    from: "918850333250",
    text: { body: "Hi" },
    type: "text",
    api_key: "secret",
    timestamp: "1787645664",
  },
};

describe("parseWappbizInbound — text", () => {
  it("accepts a well-formed text incoming_message", () => {
    expect(parseWappbizInbound(validPayload)).toEqual({
      ok: true,
      from: "918850333250",
      text: "Hi",
      messageId: "wamid.HBgMOTE4ODUwMzMzMjUwFQIA",
      kind: "text",
    });
  });

  it("messageId → null when absent", () => {
    const p = { ...validPayload, data: { ...validPayload.data, id: undefined } };
    expect(parseWappbizInbound(p)).toEqual({
      ok: true,
      from: "918850333250",
      text: "Hi",
      messageId: null,
      kind: "text",
    });
  });

  it("preserves surrounding whitespace but requires non-blank body", () => {
    const p = { ...validPayload, data: { ...validPayload.data, text: { body: "  hello  " } } };
    const r = parseWappbizInbound(p);
    expect(r).toMatchObject({ ok: true, text: "  hello  ", kind: "text" });
  });

  it("empty / whitespace-only / missing body → NO_TEXT_BODY", () => {
    for (const body of ["", "   ", undefined]) {
      const p = { ...validPayload, data: { ...validPayload.data, text: body === undefined ? undefined : { body } } };
      expect(parseWappbizInbound(p)).toEqual({ ok: false, reason: "NO_TEXT_BODY" });
    }
  });
});

describe("parseWappbizInbound — interactive / button taps", () => {
  const tap = (data: Record<string, unknown>) =>
    parseWappbizInbound({ ...validPayload, data: { ...validPayload.data, text: undefined, ...data } });

  it("button id (data.button.id) → text = the id, kind = interactive", () => {
    expect(tap({ type: "button", button: { id: "VIEW_MATCH:8f3a91c0dead" } })).toEqual({
      ok: true,
      from: "918850333250",
      text: "VIEW_MATCH:8f3a91c0dead",
      messageId: "wamid.HBgMOTE4ODUwMzMzMjUwFQIA",
      kind: "interactive",
    });
  });

  it("Meta-style interactive.button_reply.id is read", () => {
    expect(tap({ type: "interactive", interactive: { button_reply: { id: "SHOW_MORE", title: "More" } } })).toMatchObject({
      ok: true,
      text: "SHOW_MORE",
      kind: "interactive",
    });
  });

  it("falls back to button.payload, then title, then list_reply", () => {
    expect(tap({ type: "button", button: { payload: "BACK_TO_PROPOSALS" } })).toMatchObject({ text: "BACK_TO_PROPOSALS" });
    expect(tap({ type: "quick_reply", reply: { title: "Open Website" } })).toMatchObject({ text: "Open Website" });
    expect(tap({ type: "list_reply", interactive: { list_reply: { id: "P2" } } })).toMatchObject({ text: "P2" });
  });

  it("interactive tap with no usable field → NO_TEXT_BODY", () => {
    expect(tap({ type: "button", button: {} })).toEqual({
      ok: false,
      reason: "NO_TEXT_BODY",
      detail: "interactive payload had no id/title",
    });
  });
});

describe("parseWappbizInbound — rejected", () => {
  it("null / missing data → NO_DATA", () => {
    expect(parseWappbizInbound(null)).toEqual({ ok: false, reason: "NO_DATA" });
    expect(parseWappbizInbound({ type: "incoming_message" })).toEqual({ ok: false, reason: "NO_DATA" });
  });

  it("wrong envelope type → NOT_INCOMING_MESSAGE (with detail)", () => {
    expect(parseWappbizInbound({ ...validPayload, type: "status_update" })).toEqual({
      ok: false,
      reason: "NOT_INCOMING_MESSAGE",
      detail: "status_update",
    });
  });

  it("unknown data.type (e.g. image) → UNSUPPORTED_TYPE (with detail)", () => {
    const p = { ...validPayload, data: { ...validPayload.data, type: "image", text: undefined } };
    expect(parseWappbizInbound(p)).toEqual({ ok: false, reason: "UNSUPPORTED_TYPE", detail: "image" });
  });

  it("missing sender → NO_SENDER", () => {
    const p = { ...validPayload, data: { ...validPayload.data, from: undefined } };
    expect(parseWappbizInbound(p)).toEqual({ ok: false, reason: "NO_SENDER" });
  });
});

describe("extractButtonPayload — precedence", () => {
  it("prefers a real id over a human title", () => {
    expect(
      extractButtonPayload({ from: "x", button: { id: "VIEW_MATCH:abc123", title: "View P1" } }),
    ).toBe("VIEW_MATCH:abc123");
  });
  it("returns null when nothing usable", () => {
    expect(extractButtonPayload({ from: "x" })).toBeNull();
  });
});
