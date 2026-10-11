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

function detectDomain(prompt = '', category = 'outdoor') {
  const p = (prompt || '').toLowerCase();
  if (/photo|camera|lens|shoot|portrait|landscape|golden hour|street photo/.test(p)) return 'photography';
  if (/cycl|bike|biking|ride|peloton|road bike|gravel|cycling/.test(p)) return 'cycling';
  if (/board\s*game|tabletop|catan|chess|card\s*game|strategy|d&d|rpg|settlers/.test(p)) return 'boardgames';
  if (/run|running|jog|jogging|5k|10k|sprint|marathon|tempo/.test(p)) return 'running';
  if (/hike|hiking|trail|trek|ridge|summit|mountain/.test(p)) return 'hiking';
  if (/yoga|meditat|breathwork|mindful|pilates|stretch/.test(p)) return 'yoga';
  if (/spikeball|volleyball|tennis|basketball|pickleball|cricket|soccer|badminton|frisbee|sports/.test(p)) return 'sports';
  if (/sketch|draw|drawing|watercolor|paint|art|craft|knit|pottery/.test(p)) return 'creative';
  if (/coffee|cafe|book\s*club|chat|talk|cowork|networking|social/.test(p)) return 'social';
  if (/nature|bird|wildlife|flora|river|botan|stargaz/.test(p)) return 'nature';

  const categoryMap = {
    fitness: 'running',
    outdoor: 'hiking',
    nature: 'nature',
    sports: 'sports',
    social: 'social',
    wellness: 'yoga',
    arts: 'creative',
    gaming: 'boardgames',
    other: 'social'
  };
  return categoryMap[category] || 'hiking';
}

function synthesizePlanTitle(prompt, category, skillLevel, displayArea) {
  if (prompt && prompt.trim()) {
    const clean = prompt.trim();
    if (clean.length <= 55) {
      return clean.charAt(0).toUpperCase() + clean.slice(1);
    }
    return `${clean.slice(0, 52)}...`;
  }

  const domain = detectDomain(prompt, category);
  const domainTitles = {
    photography: 'Golden Hour Photo Walk & Technique Exchange',
    cycling: 'Scenic Group Cycling & Pace Line Session',
    boardgames: 'Strategy & Gateway Board Game Night',
    running: 'Community Group Run & Mobility Flow',
    hiking: 'Scenic Trail Exploration & Nature Hike',
    yoga: 'Mindful Outdoor Yoga Flow & Breathwork',
    sports: 'Recreational Court Scrimmage & Pickup Games',
    creative: 'Open-Air Sketching & Collaborative Art',
    social: 'Neighborhood Coffee Meetup & Conversation',
    nature: 'Riverside Nature Walk & Wildlife Observation'
  };

  const titleBase = domainTitles[domain] || 'Community Activity Meetup';
  const areaPart = displayArea && displayArea !== 'Local Public Park' ? ` in ${displayArea.split(',')[0].trim()}` : '';
  const result = `${titleBase}${areaPart}`;
  return result.length > 55 ? result.slice(0, 52) + '...' : result;
}

function synthesizePlanDescription({
  category = 'outdoor',
  prompt = '',
  displayArea = '',
  skillLevel = 'all-levels',
  groupSize = 6,
  budget = 0,
  durationMinutes = 60,
  time = '',
  date = ''
}) {
  const domain = detectDomain(prompt, category);
  const resolvedArea = displayArea && displayArea.trim() && displayArea.trim() !== 'Local Public Park'
    ? displayArea.trim()
    : 'a local public park';
  const duration = durationMinutes || 60;
  const timeNote = time ? ` starting promptly at ${time}` : '';
  const dateNote = date ? ` on ${date}` : '';

  // 1. Domain-Specific Narrative Premises
  let premise = '';
  let flow = '';
  let gearAdvice = '';

  switch (domain) {
    case 'photography':
      premise = prompt && prompt.trim()
        ? `Grab your camera or smartphone for ${prompt.trim().replace(/\.$/, '')}. We'll stroll through ${resolvedArea}, exploring compelling light, architectural angles, and dynamic framing opportunities together.`
        : `A relaxed photography excursion exploring scenic compositions, portrait framing, and creative lighting around ${resolvedArea}.`;
      flow = `During this ${duration}-minute session${timeNote}${dateNote}, we will spend the first 15 minutes reviewing framing ideas and camera settings, 35 minutes capturing street and landscape shots, and the final 10 minutes sharing our favorite captures and constructive feedback.`;
      gearAdvice = skillLevel === 'beginner'
        ? 'Beginners are warmly welcomed—smartphone cameras work perfectly, and we will cover basic rule-of-thirds and natural lighting tips.'
        : 'Geared for photographers looking to practice manual exposure, creative depth-of-field, and intentional composition at a steady exploratory pace.';
      break;

    case 'cycling':
      premise = prompt && prompt.trim()
        ? `Join us for ${prompt.trim().replace(/\.$/, '')}. We'll roll out from ${resolvedArea} along scenic roadways and paved trailways, emphasizing group camaraderie and smooth pedaling.`
        : `An energizing group bike ride setting out from ${resolvedArea}, enjoying smooth cycling paths and refreshing outdoor airflow.`;
      flow = `Our ride spans approximately ${duration} minutes${timeNote}${dateNote}. We will conduct a quick 5-minute pre-ride ABC check (Air, Brakes, Chain), ride a steady circuit with structured regrouping checkpoints, and finish with a casual cool-down spin.`;
      gearAdvice = skillLevel === 'advanced'
        ? 'A brisk, high-cadence workout maintaining steady paceline speeds (16–20+ mph) with minimal stops—road bikes or high-performance gravel bikes recommended.'
        : skillLevel === 'beginner'
        ? 'A low-pressure, scenic spin paced at a comfortable conversational tempo (10–13 mph) with frequent pauses at scenic overlooks.'
        : 'A balanced intermediate rhythm (13–16 mph) suitable for riders comfortable with multi-gear shifting and moderate inclines.';
      break;

    case 'boardgames':
      premise = prompt && prompt.trim()
        ? `Join our table for ${prompt.trim().replace(/\.$/, '')}! We are gathering at ${resolvedArea} to connect, unwind, and play engaging strategy and party games with friendly neighbors.`
        : `An inviting tabletop gathering at ${resolvedArea} featuring an eclectic mix of modern strategy board games, party titles, and card classics.`;
      flow = `Over the course of ${duration} minutes${timeNote}${dateNote}, we'll kick off with a quick 10-minute icebreaker title, split into balanced tables for main feature games, and wrap up with relaxed open conversation so everyone gets to meet new people.`;
      gearAdvice = skillLevel === 'beginner'
        ? 'Never played modern board games before? No problem! Every game includes a full rules walkthrough with patient, friendly instruction.'
        : 'Feel free to bring tactical and Euro-style strategy games to share with fellow hobbyists who enjoy deep mechanics and thoughtful decision-making.';
      break;

    case 'running':
      premise = prompt && prompt.trim()
        ? `Lace up your running shoes for ${prompt.trim().replace(/\.$/, '')} around ${resolvedArea}. Expect positive energy, clear route pacing, and supportive community accountability.`
        : `A community group run meeting at ${resolvedArea}, combining cardiovascular conditioning with uplifting group motivation along scenic park pathways.`;
      flow = `This ${duration}-minute session${timeNote}${dateNote} incorporates a dynamic 10-minute warmup (high knees, leg swings, hip openers), a structured continuous run with designated pace leaders, and 10 minutes of guided post-run static stretching.`;
      gearAdvice = skillLevel === 'advanced'
        ? 'High-intensity interval and tempo pacing designed for seasoned runners training for competitive distance goals.'
        : skillLevel === 'beginner'
        ? 'Gentle run-walk intervals ensuring everyone comfortably completes the loop without burnout or fatigue.'
        : 'Steady intermediate aerobic rhythm with conversational checkpoints where nobody gets left behind.';
      break;

    case 'hiking':
      premise = prompt && prompt.trim()
        ? `Hit the trails for ${prompt.trim().replace(/\.$/, '')} through ${resolvedArea}. We'll explore winding wooded paths, fresh greenery, and tranquil viewpoints together.`
        : `A refreshing nature trek exploring scenic trails and lush parkland in the ${resolvedArea} area.`;
      flow = `Our ${duration}-minute hike${timeNote}${dateNote} follows marked trail circuits with short scenic pauses to take in natural vistas, hydrate, and enjoy group conversation.`;
      gearAdvice = skillLevel === 'advanced'
        ? 'Challenging terrain with elevation gains, rocky switchbacks, and sustained hiking paces requiring sturdy footwear and advanced trail readiness.'
        : skillLevel === 'beginner'
        ? 'A relaxing, beginner-friendly hike along clear dirt trails with manageable gradients suitable for beginners and all fitness backgrounds.'
        : 'A balanced trail hike with moderate elevation and accessible paths suitable for all regular walkers.';
      break;

    case 'yoga':
      premise = prompt && prompt.trim()
        ? `Unroll your mat for ${prompt.trim().replace(/\.$/, '')} outdoors at ${resolvedArea}. Reconnect body and mind under open skies in a peaceful community setting.`
        : `A restorative outdoor yoga and mindfulness practice set in the tranquil open surroundings of ${resolvedArea}.`;
      flow = `Our ${duration}-minute flow${timeNote}${dateNote} begins with 10 minutes of grounding breathwork (pranayama), transitions into an accessible vinyasa posture sequence, and culminates in a soothing, mindful savasana outdoors.`;
      gearAdvice = skillLevel === 'beginner'
        ? 'Full beginner modifications offered for every pose; focus is entirely on your comfort, breath, and personal alignment.'
        : 'Features deeper standing holds, vinyasa transitions, and balance poses to invigorate strength and body awareness.';
      break;

    case 'sports':
      premise = prompt && prompt.trim()
        ? `Get ready to play: ${prompt.trim().replace(/\.$/, '')} at ${resolvedArea}. Expect high-spirited scrimmages, active team play, and good sportsmanship.`
        : `An active recreational sports meetup at ${resolvedArea} welcoming players for casual scrimmages and high-energy drills.`;
      flow = `Across ${duration} minutes${timeNote}${dateNote}, we will conduct a 10-minute dynamic warmup, organize fair, rotating teams, and play short games ensuring maximum court time for all ${groupSize} participants.`;
      gearAdvice = skillLevel === 'advanced'
        ? 'Competitive play featuring advanced tactical strategies and fast scrimmages.'
        : skillLevel === 'beginner'
        ? 'Recreational play welcoming beginners with friendly coaching and basic skill drills.'
        : 'Open play prioritizing safety, fair calls, and friendly team collaboration over intense rivalry.';
      break;

    case 'creative':
      premise = prompt && prompt.trim()
        ? `Bring your creative supplies for ${prompt.trim().replace(/\.$/, '')} at ${resolvedArea}. Let your imagination flow surrounded by nature and fellow creators.`
        : `An open-air creative workshop and sketching circle gathering at ${resolvedArea} to practice visual art in a supportive social atmosphere.`;
      flow = `In this ${duration}-minute meetup${timeNote}${dateNote}, we'll introduce ourselves, sketch or paint from life across local scenery, and enjoy a relaxed group show-and-tell sharing our techniques and works in progress.`;
      gearAdvice = 'Bring whichever medium you love—pencils, charcoal, ink, or watercolors are all welcome for beginners and experienced artists alike.';
      break;

    case 'social':
    default:
      premise = prompt && prompt.trim()
        ? `Come out for ${prompt.trim().replace(/\.$/, '')} in ${resolvedArea}. A relaxed, welcoming space to meet new people and foster genuine neighborhood connections.`
        : `A welcoming community social gathering in ${resolvedArea} designed to spark genuine local conversations and new friendships.`;
      flow = `Over ${duration} minutes${timeNote}${dateNote}, we'll gather in an accessible area, share stories and common interests, and connect casually with an intimate cohort of up to ${groupSize} members.`;
      gearAdvice = 'Low-key, informal, and friendly—come as you are ready to chat, listen, and expand your community circle.';
      break;
  }

  // 2. Budget Specifics
  let budgetNote = '';
  if (budget === 0) {
    budgetNote = 'This is a free community session with no admission charges or hidden fees.';
  } else {
    budgetNote = `Shared expense is $${budget} per attendee to cover reservation fees, equipment rentals, or group supplies.`;
  }

  // 3. Assemble Cohesive Narrative
  return `${premise} ${flow} ${gearAdvice} ${budgetNote} Group capacity is capped at ${groupSize} attendees to maintain a personal, safe, and engaging environment for everyone.`;
}

function getDeterministicPlan(params = {}) {
  const {
    category = 'outdoor',
    prompt = '',
    displayArea = '',
    skillLevel = 'all-levels',
    groupSize = 6,
    budget = 0,
    durationMinutes = undefined,
    time = '',
    date = ''
  } = params;

  const domain = detectDomain(prompt, category);
  const resolvedArea = displayArea && displayArea.trim().length > 0 ? displayArea.trim() : 'Local Public Park';
  const duration = durationMinutes || 60;

  const title = synthesizePlanTitle(prompt, category, skillLevel, resolvedArea);
  const description = synthesizePlanDescription({
    category,
    prompt,
    displayArea: resolvedArea,
    skillLevel,
    groupSize,
    budget,
    durationMinutes: duration,
    time,
    date
  });

  // Domain-specific checklists
  const domainChecklists = {
    photography: ['Camera or smartphone with free storage', 'Extra battery or portable charger', 'Comfortable walking shoes', 'Lens cleaning cloth'],
    cycling: ['Bicycle in good working order', 'Fitted bicycle helmet (mandatory)', 'Filled water bottle', 'Spare inner tube or patch kit'],
    boardgames: ['1–2 favorite tabletop games (optional)', 'Small snack or drink', 'Reusable cup', 'Enthusiasm to learn new games'],
    running: ['Running shoes with supportive cushioning', 'Hydration flask or belt', 'Breathable running apparel', 'Sweat towel'],
    hiking: ['Sturdy walking or hiking shoes', 'Full water bottle (at least 1 liter)', 'Weather layers / light rain jacket', 'Trail snack'],
    yoga: ['Yoga mat or large outdoor towel', 'Comfortable stretchable clothing', 'Water bottle', 'Light sweater for cooldown savasana'],
    sports: ['Athletic sneakers with good court traction', 'Water bottle', 'Sport-specific gear if you own it', 'Small towel'],
    creative: ['Sketchbook or watercolor pad', 'Drawing pencils, pens, or brushes', 'Portable cushion or blanket', 'Water container and paper towel'],
    social: ['Reusable water bottle or coffee cup', 'Curiosity and openness to meet neighbors', 'Comfortable casual attire'],
    nature: ['Comfortable walking shoes', 'Binoculars or smartphone camera', 'Water bottle', 'Sun protection / hat']
  };

  const checklist = [...(domainChecklists[domain] || domainChecklists.hiking)];
  if (budget > 0) {
    checklist.push(`Shared expense payment ($${budget})`);
  }

  const domainSafetyTips = {
    photography: ['Stay mindful of footing while looking through viewfinders', 'Respect private property boundaries in public spaces', 'Keep personal belongings secure while shooting'],
    cycling: ['Wear a secured helmet at all times', 'Signal turns and verbally call out hazards to group riders', 'Obey all traffic signals and trail right-of-way rules'],
    boardgames: ['Keep drinks covered and away from playing boards', 'Respect café or public park space guidelines', 'Help pack up game components together at the end'],
    running: ['Stick to pedestrian walkways and cross at marked signals', 'Perform dynamic warm-ups before increasing tempo', 'Stay alert to passing cyclists on mixed-use greenways'],
    hiking: ['Stay on designated marked trails to preserve habitat', 'Pack out all personal trash and wrappers (Leave No Trace)', 'Watch step on uneven roots and slippery surfaces'],
    yoga: ['Position mats on flat, dry grass free of stones', 'Listen to your body and take child\'s pose whenever needed', 'Stay hydrated before and after practice'],
    sports: ['Perform dynamic ankle and knee warmups', 'Call polite fouls and prioritize injury prevention over competition', 'Take frequent hydration breaks in shade'],
    creative: ['Pack out all paint water and supplies responsibly', 'Choose shaded spots on hot sunny days', 'Keep small art items weighed down against wind gusts'],
    social: ['Meet in well-lit, open public gathering zones', 'Be welcoming and inclusive to all neighborhood newcomers', 'Respect individual comfort levels and personal space'],
    nature: ['Maintain a respectful distance from park wildlife', 'Stay on designated trails to protect sensitive flora', 'Keep to daylight hours in nature reserves']
  };

  const safetyTips = domainSafetyTips[domain] || domainSafetyTips.hiking;

  return {
    suggestion: {
      title,
      description,
      category,
      skillLevel,
      capacity: Math.max(2, Math.min(50, groupSize || 6)),
      budget: Math.max(0, budget || 0),
      suggestedDurationMinutes: duration,
      displayArea: resolvedArea,
      checklist: checklist.slice(0, 6),
      safetyTips: safetyTips.slice(0, 4)
    },
    source: 'fallback',
    provider: 'deterministic-fallback',
    disclaimer: 'This draft was deterministically generated using your activity parameters (AI provider key not configured or offline). Review and customize all details before publishing.'
  };
}

async function callGeminiApi({
  category = 'outdoor',
  prompt = '',
  displayArea = 'Local Public Park',
  skillLevel = 'all-levels',
  groupSize = 6,
  budget = 0,
  durationMinutes = 60,
  time = '',
  date = ''
}) {
  const apiKey = getApiKey();
  const model = env.AI_MODEL || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const systemInstruction = `You are an expert community activity planning assistant for MEETUP Pulse, a neighborhood and nature social platform.
Generate a structured, safe, and realistic community activity suggestion as a JSON object matching this schema:
{
  "title": string (creative, engaging title, 5-60 chars),
  "description": string (an immersive, natural, activity-specific narrative of 80-160 words. It must detail what participants will do, the session flow/agenda over the duration, practical equipment or skill advice, and an inviting tone for the activity. Do NOT write a formulaic or generic template!),
  "category": string (must match "${category}"),
  "skillLevel": string (must match "${skillLevel}"),
  "capacity": integer (${groupSize}),
  "budget": number (${budget}),
  "suggestedDurationMinutes": integer (${durationMinutes || 60}),
  "displayArea": string ("${displayArea || 'Local Public Park'}"),
  "checklist": array of 3-5 strings (practical items attendees should bring tailored specifically to this activity),
  "safetyTips": array of 2-4 strings (practical group safety guidelines tailored specifically to this activity)
}
Crucial: Do not suggest dangerous activities or private unvetted venues. Output pure valid JSON without markdown wrapping.`;

  const userPrompt = `Category: ${category}
User Concept/Prompt: ${prompt || 'Fun group meetup'}
Display Area / Location: ${displayArea || 'Local Public Park'}
Skill Level: ${skillLevel}
Target Group Size: ${groupSize}
Budget: $${budget}
Duration: ${durationMinutes || 60} minutes
Schedule: Time ${time || 'unspecified'}, Date ${date || 'unspecified'}`;

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
      description: String(parsed.description || 'Join us for a friendly neighborhood activity!').trim().slice(0, 800),
      category: parsed.category || category,
      skillLevel: parsed.skillLevel || skillLevel,
      capacity: Math.max(2, Math.min(50, Number(parsed.capacity) || groupSize)),
      budget: Math.max(0, Number(parsed.budget) || budget),
      suggestedDurationMinutes: Number(parsed.suggestedDurationMinutes) || durationMinutes || 60,
      displayArea: String(parsed.displayArea || displayArea || 'Local Public Park').trim().slice(0, 100),
      checklist: Array.isArray(parsed.checklist) ? parsed.checklist.map((item) => String(item).trim()).slice(0, 6) : ['Water bottle', 'Comfortable footwear'],
      safetyTips: Array.isArray(parsed.safetyTips) ? parsed.safetyTips.map((tip) => String(tip).trim()).slice(0, 5) : ['Stay on marked trails', 'Keep group together']
    },
    source: 'ai',
    provider: 'gemini',
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
    fallback.errorDetails = `AI provider error (${providerError.message}). Served verified deterministic fallback template.`;
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
