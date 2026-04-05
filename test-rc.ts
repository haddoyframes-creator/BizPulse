import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({ apiKey });
  
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "Search for RC 123456 Nigeria",
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    console.log("Success:", response.text);
  } catch (e) {
    console.error("Error:", e);
  }
}

test();
