import { describe, it, expect } from "vitest";
import { parseWappbizInbound } from "../parseInbound";

/**
 * The production trace showed POST /api/webhooks/wappbiz → 200, no reply, no
 * outgoing calls. One of the two ways that happens is the route deciding the
 * payload is "not a text message" and acking without processing. These tests
 * pin exactly which shapes are accepted vs rejected (and with which reason),
 * so a provider payload change surfaces as a failing test, not silent silence.
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

describe("parseWappbizInbound — accepted", () => {
  it("accepts a well-formed text incoming_message and extracts from/text/messageId", () => {
    expect(parseWappbizInbound(validPayload)).toEqual({
      ok: true,
      from: "918850333250",
      text: "Hi",
      messageId: "wamid.HBgMOTE4ODUwMzMzMjUwFQIA",
    });
  });

  it("accepts when message id is absent (messageId → null)", () => {
    const p = { ...validPayload, data: { ...validPayload.data, id: undefined } };
    expect(parseWappbizInbound(p)).toEqual({ ok: true, from: "918850333250", text: "Hi", messageId: null });
  });

  it("preserves surrounding whitespace in the body but requires non-blank", () => {
    const p = { ...validPayload, data: { ...validPayload.data, text: { body: "  hello  " } } };
    const r = parseWappbizInbound(p);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe("  hello  ");
  });
});

describe("parseWappbizInbound — rejected, with distinct reasons", () => {
  it("null / non-object → NO_DATA", () => {
    expect(parseWappbizInbound(null)).toEqual({ ok: false, reason: "NO_DATA" });
    expect(parseWappbizInbound(undefined)).toEqual({ ok: false, reason: "NO_DATA" });
  });

  it("missing data → NO_DATA", () => {
    expect(parseWappbizInbound({ type: "incoming_message" })).toEqual({ ok: false, reason: "NO_DATA" });
  });

  it("wrong envelope type → NOT_INCOMING_MESSAGE (with detail)", () => {
    const p = { ...validPayload, type: "status_update" };
    expect(parseWappbizInbound(p)).toEqual({
      ok: false,
      reason: "NOT_INCOMING_MESSAGE",
      detail: "status_update",
    });
  });

  it("non-text message (button / media) → NOT_TEXT (with detail)", () => {
    const p = { ...validPayload, data: { ...validPayload.data, type: "button" } };
    expect(parseWappbizInbound(p)).toEqual({ ok: false, reason: "NOT_TEXT", detail: "button" });
  });

  it("interactive reply payloads are currently NOT_TEXT (documents the gap)", () => {
    const p = { ...validPayload, data: { ...validPayload.data, type: "interactive" } };
    expect(parseWappbizInbound(p)).toEqual({ ok: false, reason: "NOT_TEXT", detail: "interactive" });
  });

  it("missing sender → NO_SENDER", () => {
    const p = { ...validPayload, data: { ...validPayload.data, from: undefined } };
    expect(parseWappbizInbound(p)).toEqual({ ok: false, reason: "NO_SENDER" });
  });

  it("empty / whitespace-only body → NO_TEXT_BODY", () => {
    const empty = { ...validPayload, data: { ...validPayload.data, text: { body: "" } } };
    const blank = { ...validPayload, data: { ...validPayload.data, text: { body: "   " } } };
    const none = { ...validPayload, data: { ...validPayload.data, text: undefined } };
    expect(parseWappbizInbound(empty)).toEqual({ ok: false, reason: "NO_TEXT_BODY" });
    expect(parseWappbizInbound(blank)).toEqual({ ok: false, reason: "NO_TEXT_BODY" });
    expect(parseWappbizInbound(none)).toEqual({ ok: false, reason: "NO_TEXT_BODY" });
  });
});
