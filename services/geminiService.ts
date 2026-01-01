
import { GoogleGenAI } from "@google/genai";
import { Player, RoundHistory } from "../types";

// Always initialize GoogleGenAI with the API key from process.env.API_KEY.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getGeminiCommentary = async (
  players: Player[],
  currentOrder: Player[],
  history: RoundHistory[]
) => {
  // Hard requirement check for the API key presence.
  if (!process.env.API_KEY) return "AI tips unavailable without API key.";

  try {
    const historySummary = history.slice(-3).map(h => 
      `${h.winner} won because ${h.sitter} gave them a chance.`
    ).join('. ');

    const prompt = `
      You are a professional, slightly witty Billiards commentator.
      Current Players: ${currentOrder.map((p, i) => `${i + 1}. ${p.name}`).join(', ')}.
      Recent history: ${historySummary || 'Game just started.'}
      
      Based on the current order and who is at the top/bottom, give a short, punchy (2-3 sentences) strategic tip or funny commentary in Traditional Chinese.
      Focus on the person in the 4th position being the "underdog" for this round.
    `;

    // Use ai.models.generateContent to query the Gemini 3 Flash model.
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });

    // Extract the generated text using the .text property (not a method).
    return response.text || "Keep your eye on the cue ball!";
  } catch (error) {
    console.error("Gemini Error:", error);
    return "The table is silent for now.";
  }
};
