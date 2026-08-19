import { listFiles, readText, writeJson } from './shared.mjs';
const patterns = [
    ['OpenAI API', /from ['"]openai['"]|new OpenAI|OPENAI_API_KEY/g, 'LLM inference and embeddings'],
    ['Groq API', /from ['"]groq-sdk['"]|GROQ_API_KEY|new Groq/g, 'LLM inference'],
    ['Google Generative AI', /@google\/generative-ai|GOOGLE_.*API_KEY|Gemini|GoogleGenerativeAI/g, 'LLM inference'],
    ['Supabase', /@supabase\/supabase-js|createClient|SUPABASE/g, 'Database, auth, storage, and RPC access'],
    ['Postgres', /from ['"]pg['"]|DATABASE_URL|POSTGRES/g, 'Direct relational database access'],
    ['NextAuth', /next-auth|NEXTAUTH|AUTH_SECRET/g, 'Authentication/session management'],
    ['WhatsApp', /whatsapp|WHATSAPP|twilio/gi, 'WhatsApp messaging or OTP flows'],
    ['Email/SMTP', /SMTP|RESEND|SENDGRID|email-otp/gi, 'Email delivery and OTP flows']
];
const services = [];
for (const [service, regex, purpose] of patterns) {
    const called_from = [];
    for (const file of listFiles()) {
        if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(file)) continue;
        if (regex.test(readText(file))) called_from.push(file);
        regex.lastIndex = 0;
    }
    if (called_from.length) services.push({ service, purpose, called_from: called_from.sort(), auth_mechanism: 'Environment variable, SDK configuration, or platform-managed credentials inferred from code usage.', failure_mode: 'Integration-specific request failure; verify route-level error handling in routes inventory.', cost_implication: 'Depends on provider usage and plan.', fallback: 'none detected by scanner' });
}
writeJson('cartography/inventory/external-services.json', services);
