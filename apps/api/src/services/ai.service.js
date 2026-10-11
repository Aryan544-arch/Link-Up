const { env } = require('../config/env');

/**
 * AI Planning Service — MEETUP Pulse
 *
 * Implements optional AI-assisted activity planning with deterministic fallback.
 * Owner: Person 3 (Authentication and AI)
 *
 * Compliance:
 * - PRD §11 & §17: Platform must work 100% without AI credentials.
 * - PRD §17.12: Never auto-publish activities; output is strictly draft suggestions.
 */

const FALLBACK_TEMPLATES = {
  fitness: {
    title: 'Morning 5K Loop & Stretch',
    description: 'An energizing morning run through the park at a conversational pace, followed by cool-down stretching.',
    suggestedDurationMinutes: 60,
    checklist: ['Running shoes', 'Water bottle', 'Breathable athletic clothing', 'Optional watch/timer'],
    safetyTips: ['Stick to designated pedestrian pathways', 'Warm up with a brisk walk before jogging', 'Stay hydrated']
  },
  outdoor: {
    title: 'Weekend Scenic Park Exploration',
    description: 'A relaxed outdoor walk exploring local green spaces, scenic overlooks, and neighborhood nature trails.',
    suggestedDurationMinutes: 90,
    checklist: ['Comfortable walking shoes', 'Weather-appropriate layers', 'Water bottle', 'Sun protection'],
    safetyTips: ['Check local trail conditions beforehand', 'Stay together as a group', 'Leave no trace in public parks']
  },
  nature: {
    title: 'Riverside Nature Walk & Photography',
    description: 'Casual nature observation along the riverfront, spotting local birds and enjoying scenic photo spots.',
    suggestedDurationMinutes: 120,
    checklist: ['Walking shoes', 'Camera or smartphone', 'Sunscreen', 'Snack or light drink'],
    safetyTips: ['Stay behind safety railings near water bodies', 'Be mindful of bicycle lanes on mixed-use trails']
  },
  sports: {
    title: 'Casual Pickup Basketball / Court Games',
    description: 'Friendly, low-pressure half-court pickup games open to players of all skill levels. Bring your game and good vibes.',
    suggestedDurationMinutes: 90,
    checklist: ['Athletic sneakers', 'Basketball / equipment', 'Water bottle', 'Small towel'],
    safetyTips: ['Perform dynamic ankle and knee warmups', 'Call polite fouls and emphasize fair play', 'Take frequent water breaks']
  },
  social: {
    title: 'Afternoon Board Games & Conversation',
    description: 'Relaxed gathering at a public park gazebo or local cafe to play strategy board games and meet new friends.',
    suggestedDurationMinutes: 120,
    checklist: ['Favorite card/board game to share', 'Reusable beverage cup', 'Curiosity and enthusiasm'],
    safetyTips: ['Choose a well-lit, accessible public space', 'Respect cafe or park table space rules']
  },
  wellness: {
    title: 'Mindful Outdoor Yoga & Breathwork',
    description: 'Gentle morning yoga flow and guided breathing exercises in a tranquil park meadow.',
    suggestedDurationMinutes: 60,
    checklist: ['Yoga mat or large towel', 'Comfortable stretchable attire', 'Water bottle', 'Light blanket/jacket'],
    safetyTips: ['Practice on flat, even grass', 'Listen to your body and adjust poses to comfort']
  },
  arts: {
    title: 'Open-Air Sketching & Creative Meetup',
    description: 'Casual gathering for drawing, sketching, and watercolor in the park. Beginners and experienced artists welcome.',
    suggestedDurationMinutes: 90,
    checklist: ['Sketchbook or pad', 'Pencils, pens, or watercolors', 'Portable sitting cushion or mat'],
    safetyTips: ['Choose shaded areas on sunny days', 'Dispose of watercolor rinse water responsibly']
  },
  gaming: {
    title: 'Casual Tabletop & Card Game Session',
    description: 'Fun outdoor or community space tabletop gaming with classics and lightweight strategy games.',
    suggestedDurationMinutes: 120,
    checklist: ['1–2 games you enjoy teaching', 'Snack to share (optional)', 'Water bottle'],
    safetyTips: ['Keep small game pieces contained against wind', 'Agree on game rules before starting']
  },
  other: {
    title: 'Community Neighborhood Explorer Walk',
    description: 'A friendly group stroll discovering historic architecture, hidden park corners, and local landmarks.',
    suggestedDurationMinutes: 90,
    checklist: ['Walking shoes', 'Water', 'Curiosity about local history'],
    safetyTips: ['Use designated crosswalks', 'Keep group compact on narrow sidewalks']
  }
};

function getApiKey() {
  return (process.env.AI_PROVIDER_API_KEY || env.AI_PROVIDER_API_KEY || '').trim();
}

function getAiStatus() {
  const apiKey = getApiKey();
  const isConfigured = Boolean(apiKey && apiKey.length > 0);
  return {
    enabled: isConfigured,
    model: process.env.AI_MODEL || env.AI_MODEL || 'gemini-1.5-flash',
    provider: isConfigured ? 'gemini' : 'deterministic-fallback'
  };
}

function getDeterministicPlan({ category = 'outdoor', prompt = '', displayArea = '', skillLevel = 'all-levels', groupSize = 6, budget = 0 }) {
  const base = FALLBACK_TEMPLATES[category] || FALLBACK_TEMPLATES.outdoor;

  let title = base.title;
  let description = base.description;

  // Personalize title & description if a custom prompt was provided
  if (prompt && prompt.trim().length > 0) {
    const cleanPrompt = prompt.trim();
    title = `${cleanPrompt.slice(0, 1).toUpperCase() + cleanPrompt.slice(1)}`;
    if (title.length > 55) {
      title = `${title.slice(0, 52)}...`;
    }
    description = `${base.description} Focus: ${cleanPrompt}.`;
  }

  const resolvedArea = displayArea && displayArea.trim().length > 0 ? displayArea.trim() : 'Local Public Park';

  return {
    suggestion: {
      title,
      description,
      category,
      skillLevel,
      capacity: Math.max(2, Math.min(50, groupSize || 6)),
      budget: Math.max(0, budget || 0),
      suggestedDurationMinutes: base.suggestedDurationMinutes,
      displayArea: resolvedArea,
      checklist: base.checklist,
      safetyTips: base.safetyTips
    },
    source: 'fallback',
    disclaimer: 'This is a deterministic activity draft template. Review and edit all fields before saving or publishing.'
  };
}

async function callGeminiApi({ category, prompt, displayArea, skillLevel, groupSize, budget }) {
  const apiKey = env.AI_PROVIDER_API_KEY;
  const model = env.AI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const systemInstruction = `You are an AI activity planning assistant for MEETUP Pulse, a neighborhood and nature social platform.
Generate a structured, safe, and realistic community activity suggestion as a JSON object matching this schema:
{
  "title": string (engaging, 5-60 chars),
  "description": string (detailed, 40-300 chars, describing what attendees will do),
  "category": string (must match "${category}"),
  "skillLevel": string (must match "${skillLevel}"),
  "capacity": integer (${groupSize}),
  "budget": number (${budget}),
  "suggestedDurationMinutes": integer (30 to 240),
  "displayArea": string ("${displayArea || 'Local Public Park'}"),
  "checklist": array of 3-5 strings (items attendees should bring),
  "safetyTips": array of 2-4 strings (practical group safety guidelines)
}
Crucial: Do not suggest dangerous activities or private unvetted venues. Output pure valid JSON without markdown wrapping.`;

  const userPrompt = `Category: ${category}
User Concept/Prompt: ${prompt || 'Fun group meetup'}
Display Area: ${displayArea || 'Local Public Park'}
Skill Level: ${skillLevel}
Target Group Size: ${groupSize}
Budget: $${budget}`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${systemInstruction}\n\n${userPrompt}` }]
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.7
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API HTTP ${response.status}: ${errorText.slice(0, 150)}`);
  }

  const result = await response.json();
  const rawContent = result.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawContent) {
    throw new Error('Gemini API returned empty candidate response');
  }

  const parsed = JSON.parse(rawContent);

  return {
    suggestion: {
      title: String(parsed.title || 'Community Activity Meetup').trim().slice(0, 60),
      description: String(parsed.description || 'Join us for a friendly neighborhood activity!').trim().slice(0, 500),
      category: parsed.category || category,
      skillLevel: parsed.skillLevel || skillLevel,
      capacity: Math.max(2, Math.min(50, Number(parsed.capacity) || groupSize)),
      budget: Math.max(0, Number(parsed.budget) || budget),
      suggestedDurationMinutes: Number(parsed.suggestedDurationMinutes) || 90,
      displayArea: String(parsed.displayArea || displayArea || 'Local Public Park').trim().slice(0, 100),
      checklist: Array.isArray(parsed.checklist) ? parsed.checklist.map((item) => String(item).trim()).slice(0, 6) : ['Water bottle', 'Comfortable footwear'],
      safetyTips: Array.isArray(parsed.safetyTips) ? parsed.safetyTips.map((tip) => String(tip).trim()).slice(0, 5) : ['Stay on marked trails', 'Keep group together']
    },
    source: 'ai',
    disclaimer: 'This is an AI-generated activity draft. Review and edit details before saving or publishing.'
  };
}

async function generateActivityPlan(params = {}) {
  const apiKey = getApiKey();
  const isConfigured = Boolean(apiKey && apiKey.length > 0);

  if (!isConfigured) {
    return getDeterministicPlan(params);
  }

  try {
    return await callGeminiApi(params);
  } catch (providerError) {
    console.warn('[AI Service] LLM call failed, falling back to deterministic template:', providerError.message);
    const fallback = getDeterministicPlan(params);
    fallback.errorDetails = 'AI provider unreachable or timed out; served verified fallback template.';
    return fallback;
  }
}

module.exports = {
  getAiStatus,
  getDeterministicPlan,
  callGeminiApi,
  generateActivityPlan,
  FALLBACK_TEMPLATES
};
