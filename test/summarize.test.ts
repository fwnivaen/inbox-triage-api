import { afterEach, describe, expect, it, vi } from "vitest";
import { summarizeAndReply } from "../src/summarize.js";
import type { InboundEmail, Label } from "../src/types.js";

const email: InboundEmail = {
  id: "fabricated-ai-regression", fromAddress: "sam@example.com", fromName: "Sam Example",
  subject: "Project discussion notes", body: "The team approved the outline. Can you review the milestones?",
  receivedAt: "2026-11-03T12:00:00Z", hasAttachment: false,
};
const valid = { summary: "The team approved the outline and requests feedback on the milestones.", suggested_reply: "Thanks for the update. I will review the milestones and follow up." };
function environment(run: (...args: unknown[]) => unknown): Env {
  return { AI: { run } } as unknown as Env;
}
function summarize(result: unknown, label: Label = "Needs Reply") {
  return summarizeAndReply(environment(async () => result), email, label, email.body);
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Workers AI summary contract", () => {
  it.each([
    ["native text", { response: JSON.stringify(valid) }],
    ["plain text", JSON.stringify(valid)],
    ["structured native response", { response: valid }],
    ["direct object", valid],
    ["chat text", { choices: [{ message: { content: JSON.stringify(valid) } }] }],
    ["chat object", { choices: [{ message: { content: valid } }] }],
    ["fenced JSON with code braces", '```python\nreturn {"summary": summary, "suggested_reply": None}\n```\nOutput:\n```json\n' + JSON.stringify(valid) + '\n```'],
    ["quoted braces and escapes", { response: JSON.stringify({ ...valid, summary: 'Review the "outline {draft}" and share feedback on the milestones.' }) }],
  ])("accepts a usable summary from %s", async (_name, result) => {
    const output = await summarize(result);
    expect(output.summarySource).toBe("ai");
    expect(output.summary).toMatch(/milestones/);
    expect(output.suggested_reply).toBe(valid.suggested_reply);
  });

  it.each([
    null, { response: null }, { response: "invalid" }, { response: { email_id: "12345", status: "awaiting_response" } },
    { response: JSON.stringify({ summary: "", suggested_reply: valid.suggested_reply }) },
    { response: JSON.stringify({ summary: "Your [redacted].", suggested_reply: valid.suggested_reply }) },
    { response: JSON.stringify({ summary: 42 }) }, { response: "{".repeat(16001) },
  ])("preserves honest fallback on unusable output %#", async (result) => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const output = await summarize(result);
    expect(output.summarySource).toBe("fallback");
    expect(output.summary).toBe("The team approved the outline.");
    expect(output.suggested_reply).toMatch(/^Hi Sam,/);
  });

  it("requests a supported model and strict schema with redacted untrusted email data", async () => {
    const run = vi.fn(async () => ({ response: valid }));
    const secretEmail = { ...email, subject: "Contact person@example.com with verification code: 765432" };
    const output = await summarizeAndReply(environment(run), secretEmail, "Needs Reply", "Review account number 12345678 and password: fabricated-secret-value.");
    const [model, input] = run.mock.calls[0] as unknown as [string, { messages: { role: string; content: string }[]; response_format: unknown }];
    expect(model).toBe("@cf/meta/llama-3.1-8b-instruct-fp8");
    expect(input.messages[0]).toMatchObject({ role: "system" });
    expect(input.messages[0].content).toContain("untrusted data");
    expect(input.response_format).toMatchObject({ type: "json_object", json_schema: { required: ["summary", "suggested_reply"], additionalProperties: false } });
    expect(JSON.stringify(input)).not.toMatch(/person@example.com|765432|12345678|fabricated-secret-value/);
    expect(output.summarySource).toBe("ai");
  });

  it("redacts model output and never allows replies for non-reply labels", async () => {
    const result = { response: { summary: "Review the milestones with person@example.com using verification code: 765432.", suggested_reply: "Contact person@example.com about the milestones using password: fabricated-secret-value." } };
    expect(JSON.stringify(await summarize(result))).not.toMatch(/person@example.com|765432|fabricated-secret-value/);
    expect((await summarize(result, "Receipts")).suggested_reply).toBeNull();
  });

  it("decodes a raw binding HTTP response without relying on a text postprocessor", async () => {
    expect((await summarize(new Response(JSON.stringify({ response: valid })))).summarySource).toBe("ai");
  });

  it("keeps raw provider rejection bodies private while reporting status and code", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = new Response(JSON.stringify({ errors: [{ code: 5007, message: "Unknown model with person@example.com password: fabricated-secret-value" }] }), { status: 404 });
    expect((await summarize(response)).summarySource).toBe("fallback");
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ reason: "provider_error", detail: "model_unavailable", status: 404, code: 5007 });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/person@example.com|fabricated-secret-value/);
  });

  it("retains the status and fallback when a provider rejection is not JSON", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await summarize(new Response("private upstream text", { status: 503 }))).summarySource).toBe("fallback");
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ reason: "provider_error", status: 503 });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private upstream text");
  });

  it("uses a fallback reply if only the AI reply is unusable", async () => {
    const output = await summarize({ response: { ...valid, suggested_reply: "[redacted]" } });
    expect(output.summarySource).toBe("ai");
    expect(output.suggested_reply).toMatch(/^Hi Sam,/);
  });

  it("logs only fixed failure enums and numeric codes when inference fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = Object.assign(new Error("model not found; person@example.com password: fabricated-secret-value"), { status: 404, code: 5007 });
    const output = await summarizeAndReply(environment(async () => { throw error; }), email, "Needs Reply", email.body);
    expect(output.summarySource).toBe("fallback");
    expect(JSON.parse(warn.mock.calls[0][0])).toEqual({ message: "ai_summary_fallback", reason: "provider_error", detail: "model_unavailable", errorClass: "Error", status: 404, code: 5007 });
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/person@example.com|fabricated-secret-value|model not found/);
  });

  it("never extracts credential-looking numbers from provider error text", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await summarizeAndReply(environment(async () => { throw new Error("ERROR 765432: private provider response"); }), email, "Needs Reply", email.body);
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/765432|private provider response/);
  });

  it("retains the eight-second deadline without an outage or second inference call", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const run = vi.fn(() => new Promise(() => {}));
    const pending = summarizeAndReply(environment(run), email, "Needs Reply", email.body);
    await vi.advanceTimersByTimeAsync(8000);
    expect((await pending).summarySource).toBe("fallback");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
