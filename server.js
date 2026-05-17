require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const twilio = require("twilio");
const OpenAI = require("openai");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const DATA_DIR = path.join(__dirname, "data");
const CALLS_FILE = path.join(DATA_DIR, "calls.json");
const APPOINTMENTS_FILE = path.join(DATA_DIR, "appointments.json");

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(CALLS_FILE)) fs.writeFileSync(CALLS_FILE, "[]");
if (!fs.existsSync(APPOINTMENTS_FILE)) fs.writeFileSync(APPOINTMENTS_FILE, "[]");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getClinicInfo() {
  return {
    name: process.env.CLINIC_NAME || "Clinic",
    timings: process.env.CLINIC_TIMINGS || "Monday to Saturday, 9 AM to 6 PM",
    address: process.env.CLINIC_ADDRESS || "Clinic address not set",
    phone: process.env.CLINIC_PHONE || "clinic phone not set",
    doctors: process.env.CLINIC_DOCTORS || "Doctor details not set",
    fees: process.env.CLINIC_FEES || "Fee details not set",
    language: process.env.CLINIC_LANGUAGE || "en-IN",
  };
}

function basicAuth(req, res, next) {
  const password = process.env.ADMIN_PASSWORD || "admin";
  const provided = req.headers["x-admin-password"] || req.query.password;
  if (provided === password) return next();
  return res.status(401).json({ error: "Unauthorized. Add ?password=YOUR_ADMIN_PASSWORD" });
}

function saveCallLog({ from, speech, reply, intent }) {
  const logs = readJson(CALLS_FILE);
  const item = {
    id: uuidv4(),
    time: new Date().toISOString(),
    from,
    speech,
    reply,
    intent: intent || "general",
  };
  logs.unshift(item);
  writeJson(CALLS_FILE, logs.slice(0, 500));
  return item;
}

function saveAppointmentRequest({ from, name, preferredTime, reason, rawSpeech }) {
  const appointments = readJson(APPOINTMENTS_FILE);
  const item = {
    id: uuidv4(),
    status: "new",
    createdAt: new Date().toISOString(),
    from,
    name: name || "Not provided",
    preferredTime: preferredTime || "Not provided",
    reason: reason || "Not provided",
    rawSpeech: rawSpeech || "",
  };
  appointments.unshift(item);
  writeJson(APPOINTMENTS_FILE, appointments);
  return item;
}

const emergencyWords = [
  "emergency", "chest pain", "heart attack", "breathing", "accident", "bleeding",
  "unconscious", "faint", "stroke", "severe pain", "can't breathe", "cannot breathe"
];

function looksEmergency(text) {
  const t = (text || "").toLowerCase();
  return emergencyWords.some(w => t.includes(w));
}

async function classifyAndReply(callerSpeech) {
  const clinic = getClinicInfo();

  if (looksEmergency(callerSpeech)) {
    return {
      intent: "emergency",
      reply: "This sounds urgent. Please call local emergency services or visit the nearest hospital immediately. I cannot handle emergencies on this call.",
      appointment: null,
    };
  }

  const system = `
You are ClinicCall AI, a safe AI receptionist for ${clinic.name}.

Rules:
- You can help with appointments, timing, address, fees, doctors, and general receptionist questions.
- Do not diagnose, prescribe, or give treatment advice.
- If the caller asks for medical advice, tell them to speak with the doctor.
- Keep replies short and natural for a phone call.
- If caller wants appointment, collect name, preferred date/time, and reason for visit.
- If appointment details are present, confirm that the clinic staff will review and call back.
- Return JSON only with keys: intent, reply, appointment.
- intent must be one of: appointment, timing, address, fees, doctor, medical_advice_refusal, emergency, general.
- appointment must be null or an object with: name, preferredTime, reason.

Clinic info:
Name: ${clinic.name}
Timings: ${clinic.timings}
Address: ${clinic.address}
Phone: ${clinic.phone}
Doctors: ${clinic.doctors}
Fees: ${clinic.fees}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    max_tokens: 220,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: callerSpeech || "Caller was silent." },
    ],
  });

  const parsed = JSON.parse(completion.choices[0].message.content);
  return {
    intent: parsed.intent || "general",
    reply: parsed.reply || "Please contact the clinic directly for help.",
    appointment: parsed.appointment || null,
  };
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/api/calls", basicAuth, (req, res) => {
  res.json(readJson(CALLS_FILE));
});

app.get("/api/appointments", basicAuth, (req, res) => {
  res.json(readJson(APPOINTMENTS_FILE));
});

app.patch("/api/appointments/:id", basicAuth, (req, res) => {
  const appointments = readJson(APPOINTMENTS_FILE);
  const index = appointments.findIndex(a => a.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: "Not found" });

  appointments[index] = { ...appointments[index], ...req.body, updatedAt: new Date().toISOString() };
  writeJson(APPOINTMENTS_FILE, appointments);
  res.json(appointments[index]);
});

app.post("/voice", (req, res) => {
  const clinic = getClinicInfo();
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say(
    { voice: "alice", language: clinic.language },
    `Hello, thank you for calling ${clinic.name}. This call may be handled by an AI assistant. How can I help you today?`
  );

  const gather = twiml.gather({
    input: "speech",
    action: "/respond",
    method: "POST",
    speechTimeout: "auto",
    language: clinic.language,
  });

  gather.say({ voice: "alice", language: clinic.language }, "Please speak after the beep.");
  twiml.redirect("/voice");

  res.type("text/xml").send(twiml.toString());
});

app.post("/respond", async (req, res) => {
  const clinic = getClinicInfo();
  const from = req.body.From || "Unknown";
  const speech = req.body.SpeechResult || "";

  const twiml = new twilio.twiml.VoiceResponse();

  try {
    const result = await classifyAndReply(speech);

    if (result.appointment) {
      saveAppointmentRequest({
        from,
        name: result.appointment.name,
        preferredTime: result.appointment.preferredTime,
        reason: result.appointment.reason,
        rawSpeech: speech,
      });
    }

    saveCallLog({
      from,
      speech,
      reply: result.reply,
      intent: result.intent,
    });

    twiml.say({ voice: "alice", language: clinic.language }, result.reply);

    const gather = twiml.gather({
      input: "speech",
      action: "/respond",
      method: "POST",
      speechTimeout: "auto",
      language: clinic.language,
    });

    gather.say({ voice: "alice", language: clinic.language }, "Anything else I can help you with?");
    twiml.say({ voice: "alice", language: clinic.language }, "Thank you for calling. Goodbye.");
  } catch (error) {
    console.error(error);
    twiml.say(
      { voice: "alice", language: clinic.language },
      "Sorry, there is a technical issue. Please contact the clinic directly."
    );
  }

  res.type("text/xml").send(twiml.toString());
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`ClinicCall AI Final running on port ${port}`));
