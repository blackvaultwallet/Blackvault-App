import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import {
  VAULT_KEEPER_SYSTEM,
  buildVaultKeeperContext,
  type Portfolio,
  type PrivacyContext,
} from "@blackvault/sdk";
import { rateLimit } from "@/lib/server/rate-limit";

export const runtime = "nodejs";

// Reads ANTHROPIC_API_KEY server-side.
const client = new Anthropic();

export async function POST(request: Request) {
  // Paid LLM behind this route — keep the per-IP budget tight.
  const limited = await rateLimit(request, "agent", 10, 60);
  if (limited) return limited;
  try {
    const { message, portfolio, privacy } = (await request.json()) as {
      message?: string;
      portfolio?: Portfolio | null;
      privacy?: PrivacyContext | null;
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Missing 'message' parameter." },
        { status: 400 }
      );
    }

    const context = portfolio
      ? buildVaultKeeperContext(portfolio, privacy ?? undefined)
      : "User portfolio unavailable (not logged in or empty).";

    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: VAULT_KEEPER_SYSTEM,
      messages: [
        {
          role: "user",
          content: `${context}\n\nUser question:\n${message}`,
        },
      ],
    });

    const reply = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();

    return NextResponse.json({ reply });
  } catch (err) {
    console.error("Vault Keeper error:", err);
    return NextResponse.json(
      { error: "Vault Keeper request failed." },
      { status: 500 }
    );
  }
}
