import { GoogleGenAI } from '@google/genai'
import { NextRequest, NextResponse } from 'next/server'

interface ExtractedClientData {
  fullName: string
  phone: string
  email: string
  company: string
  serviceRequested: string
  projectDescription: string
  eventDate: string
  preferredDeadline: string
  budget: string
  notes: string
}

function fallbackExtract(text: string): ExtractedClientData {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  let fullName = ''
  let phone = ''
  let email = ''
  let company = ''
  let serviceRequested = ''
  let projectDescription = ''
  let eventDate = ''
  let preferredDeadline = ''
  let budget = ''
  let notes = ''

  // Email regex
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
  if (emailMatch) email = emailMatch[0]

  // Phone regex (e.g., +233..., 024..., 050..., etc.)
  const phoneMatch = text.match(/(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{3,4}/)
  if (phoneMatch) phone = phoneMatch[0].trim()

  // Budget match (e.g., GH₵ 5,000 or GHS 500 or $500 or 5000 cedis)
  const budgetMatch = text.match(/(?:GH[S₵]?|\$|USD|EUR)\s?[\d,]+(?:\.\d{2})?|[\d,]+\s?(?:cedis|GHS|GH₵)/i)
  if (budgetMatch) budget = budgetMatch[0].trim()

  // Process line by line for labeled values
  for (const line of lines) {
    const lower = line.toLowerCase()

    if (lower.includes('name:') || lower.startsWith('1.') || lower.startsWith('full name')) {
      const parts = line.split(/:(.+)/)
      if (parts[1]) fullName = parts[1].trim()
    } else if (!fullName && !line.includes('@') && !line.match(/\d{5,}/) && line.length < 40 && !line.includes('http')) {
      // First short non-contact line might be the name if not matched yet
      if (!fullName && lines.indexOf(line) === 0) {
        fullName = line
      }
    }

    if (lower.includes('service:') || lower.includes('needs') || lower.includes('looking for') || lower.includes('request:')) {
      const parts = line.split(/:(.+)/)
      serviceRequested = parts[1] ? parts[1].trim() : line
    }

    if (lower.includes('date:') || lower.includes('deadline:') || lower.includes('for december') || lower.includes('event')) {
      if (lower.includes('deadline')) {
        preferredDeadline = line
      } else {
        eventDate = line
      }
    }

    if (lower.includes('company:') || lower.includes('business:')) {
      const parts = line.split(/:(.+)/)
      if (parts[1]) company = parts[1].trim()
    }
  }

  // Fallback description if service requested is empty
  if (!serviceRequested && lines.length > 2) {
    projectDescription = text
  }

  return {
    fullName,
    phone,
    email,
    company,
    serviceRequested,
    projectDescription: projectDescription || text.slice(0, 150),
    eventDate,
    preferredDeadline,
    budget,
    notes,
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const text = body?.text || ''

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Text string is required' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ data: fallbackExtract(text) })
    }

    const ai = new GoogleGenAI({ apiKey })
    const prompt = `You are an AI assistant parsing client intake details from unstructured text (such as WhatsApp chats, emails, DMs, or notes).
Extract all available client and project request details into a strict JSON object.

CRITICAL RULES:
1. Do NOT guess or invent information. If a field is missing from the text, return an empty string "" for that field.
2. Format phone numbers cleanly (e.g. +233 24 123 4567 or 0241234567).
3. If a budget is mentioned (e.g. GH₵5,000, $1000), extract it cleanly as a text representation or number.
4. Separate the client name, email, phone, and company from the service request or event description.

Return ONLY JSON matching this exact structure:
{
  "fullName": "string",
  "phone": "string",
  "email": "string",
  "company": "string",
  "serviceRequested": "string",
  "projectDescription": "string",
  "eventDate": "string",
  "preferredDeadline": "string",
  "budget": "string",
  "notes": "string"
}

Raw Text to Parse:
"""
${text}
"""`

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    })

    const rawOutput = response.text
    if (!rawOutput) {
      return NextResponse.json({ data: fallbackExtract(text) })
    }

    const parsed = JSON.parse(rawOutput) as ExtractedClientData
    return NextResponse.json({
      data: {
        fullName: parsed.fullName || '',
        phone: parsed.phone || '',
        email: parsed.email || '',
        company: parsed.company || '',
        serviceRequested: parsed.serviceRequested || '',
        projectDescription: parsed.projectDescription || '',
        eventDate: parsed.eventDate || '',
        preferredDeadline: parsed.preferredDeadline || '',
        budget: parsed.budget || '',
        notes: parsed.notes || '',
      },
    })
  } catch (err) {
    console.error('Error in /api/ai/extract-client:', err)
    // Fallback to client-side rule extraction
    try {
      const body = await req.json().catch(() => ({}))
      return NextResponse.json({ data: fallbackExtract(body?.text || '') })
    } catch {
      return NextResponse.json({
        data: {
          fullName: '',
          phone: '',
          email: '',
          company: '',
          serviceRequested: '',
          projectDescription: '',
          eventDate: '',
          preferredDeadline: '',
          budget: '',
          notes: '',
        },
      })
    }
  }
}
