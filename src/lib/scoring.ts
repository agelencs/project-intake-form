import type {
  Bucket,
  Confidence,
  FormAnswers,
  ScoreResult,
} from "./types";

function str(answers: FormAnswers, key: string): string {
  const v = answers[key];
  return typeof v === "string" ? v : "";
}

function arr(answers: FormAnswers, key: string): string[] {
  const v = answers[key];
  return Array.isArray(v) ? v : [];
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.round(Math.min(max, Math.max(min, n)));
}

function parseCount(raw: string): number {
  const cleaned = raw.trim().replace(/,/g, "");
  const range = cleaned.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (range) {
    return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
  }
  const num = parseFloat(cleaned);
  return Number.isFinite(num) && num > 0 ? num : 1;
}

function frequencyMultiplier(freq: string): number {
  const map: Record<string, number> = {
    "Many times a day": 250,
    "About once a day": 250,
    "A few times a week": 52,
    Weekly: 52,
    Monthly: 12,
    Quarterly: 4,
    "A few times a year / when something comes up": 1,
  };
  return map[freq] ?? 12;
}

function durationMinutes(duration: string): number {
  const map: Record<string, number> = {
    "Under 15 min": 10,
    "15–30 min": 22,
    "30–60 min": 45,
    "1–2 hours": 90,
    "2–4 hours": 180,
    "Half a day": 240,
    "A full day or more": 480,
  };
  return map[duration] ?? 30;
}

function peopleMultiplier(people: string): number {
  const map: Record<string, number> = {
    "1": 1,
    "2–3": 2.5,
    "4–7": 5.5,
    "8 or more": 8,
  };
  return map[people] ?? 1;
}

function doingFactor(waiting: string): number {
  if (waiting === "Almost all doing") return 1;
  if (waiting === "Mix of doing and waiting") return 0.75;
  return 0.4;
}

function weeklyGuessHours(guess: string): number | null {
  const map: Record<string, number> = {
    "Under 2 hours": 1,
    "2–8 hours": 5,
    "About 1–2 days": 12,
    "3–5 days": 32,
    "More than one full-time person": 40,
  };
  return map[guess] ?? null;
}

function volumeScore(hoursPerYear: number): { score: number; reason: string } {
  if (hoursPerYear >= 2000)
    return { score: 40, reason: `Very high volume (~${Math.round(hoursPerYear)} hrs/year)` };
  if (hoursPerYear >= 800)
    return { score: 32, reason: `High volume (~${Math.round(hoursPerYear)} hrs/year)` };
  if (hoursPerYear >= 300)
    return { score: 24, reason: `Moderate volume (~${Math.round(hoursPerYear)} hrs/year)` };
  if (hoursPerYear >= 100)
    return { score: 16, reason: `Some volume (~${Math.round(hoursPerYear)} hrs/year)` };
  if (hoursPerYear >= 40)
    return { score: 10, reason: `Limited volume (~${Math.round(hoursPerYear)} hrs/year)` };
  return { score: 5, reason: `Low volume (~${Math.round(hoursPerYear)} hrs/year)` };
}

function bucketLabel(bucket: Bucket): string {
  const labels: Record<Bucket, string> = {
    "do-first": "Do first",
    investigate: "Investigate",
    "easy-win": "Easy win",
    park: "Park",
  };
  return labels[bucket];
}

function deriveRecommendedScope(answers: FormAnswers): string {
  const timeFocus = str(answers, "Q34");
  const requested = arr(answers, "Q42");
  const sameSteps = str(answers, "Q24");
  const exceptions = str(answers, "Q25");

  if (sameSteps === "It depends a lot on the situation") {
    return "Start with a narrow slice of the happy path — full end-to-end is unlikely as a first step.";
  }
  if (exceptions === "Almost every item is different") {
    return "Automate data movement or checking on straightforward cases; route exceptions to a person.";
  }
  if (timeFocus === "Waiting / chasing" || requested.includes("Reminders and chasing")) {
    return "Focus on reminders, handoffs, and workflow — not just data entry.";
  }
  if (timeFocus === "Typing or copying data" || str(answers, "Q31").includes("copy")) {
    return "Data movement between systems is the natural first slice.";
  }
  if (timeFocus === "Checking and validating") {
    return "Validation and exception flagging — keep approvals with a person.";
  }
  if (requested.includes("The whole process, end to end")) {
    return "Scope down to one high-pain step first, then expand if it works.";
  }
  return "Start with the most repetitive step from your process walkthrough.";
}

export function calculateScore(answers: FormAnswers): ScoreResult {
  const impactReasons: string[] = [];
  const feasibilityReasons: string[] = [];
  const riskReasons: string[] = [];
  const confidenceReasons: string[] = [];
  const flags: string[] = [];
  const feedback: string[] = [];

  const count = parseCount(str(answers, "Q12"));
  const freqMult = frequencyMultiplier(str(answers, "Q11"));
  const minutes = durationMinutes(str(answers, "Q13"));
  const people = peopleMultiplier(str(answers, "Q15"));
  const doing = doingFactor(str(answers, "Q14"));

  const rawHoursPerYear = (count * freqMult * minutes * people) / 60;
  const hoursPerYear = rawHoursPerYear * doing;
  const hoursPerWeek = hoursPerYear / 52;

  let impact = 0;
  const vol = volumeScore(hoursPerYear);
  impact += vol.score;
  impactReasons.push(vol.reason);

  const workType = str(answers, "Q8");
  if (workType.includes("Checking or validating")) {
    impact += 6;
    impactReasons.push("Validation work — errors have direct financial impact");
  } else if (workType.includes("Copying or moving")) {
    impact += 5;
    impactReasons.push("High-volume data movement — strong time-saving potential");
  } else if (workType.includes("mix")) {
    impact += 4;
  } else {
    impact += 3;
  }

  const validationType = str(answers, "Q9");
  if (validationType.includes("Two systems")) {
    impact += 5;
    impactReasons.push("Cross-system checks — mismatches cause rework");
  } else if (validationType.includes("fixed rule")) {
    impact += 4;
    impactReasons.push("Rule-based checks — automatable validation");
  } else if (validationType.includes("prior period")) {
    impact += 3;
  }

  const pileUp = arr(answers, "Q17");
  if (pileUp.includes("Management or leadership notices")) {
    impact += 6;
    impactReasons.push("Leadership visibility when work piles up");
  }
  if (pileUp.includes("Legal, tax, or compliance problem") === false) {
    if (pileUp.includes("Deadlines slip")) impact += 4;
    if (pileUp.includes("People work overtime")) impact += 4;
    if (pileUp.includes("More mistakes")) impact += 5;
  }
  if (pileUp.includes("It just waits — no big deal")) {
    impact -= 8;
    impactReasons.push("Backlog has limited consequence");
  }

  const peaks = str(answers, "Q16");
  if (peaks !== "Steady year-round") {
    impact += 5;
    impactReasons.push("Busy periods add pressure");
  }

  const errorCost = str(answers, "Q37");
  const errorMap: Record<string, number> = {
    "Small inconvenience — we fix it later": 2,
    "Extra rework for the team": 6,
    "Money lost or spent wrongly": 10,
    "Customer complaint": 12,
    "Legal, tax, or compliance problem": 15,
  };
  impact += errorMap[errorCost] ?? 0;
  if ((errorMap[errorCost] ?? 0) >= 10) {
    impactReasons.push("High cost when done wrong");
  }

  const deadline = str(answers, "Q40");
  if (deadline.startsWith("Yes")) {
    impact += 8;
    impactReasons.push("Hard deadline with consequences");
  } else if (deadline.includes("expected turnaround")) {
    impact += 4;
  }

  const valueDriver = str(answers, "Q41");
  if (valueDriver === "We cannot keep up with the volume") {
    impact += 10;
    impactReasons.push("Team cannot keep up with volume");
  } else if (valueDriver === "Faster for customers") {
    impact += 7;
  } else if (valueDriver === "Reduce risk (key person or compliance)") {
    impact += 6;
  }

  const urgency = str(answers, "Q47");
  if (urgency === "We are struggling now") {
    impact += 8;
    impactReasons.push("Urgent — team struggling now");
  } else if (urgency === "This quarter would be valuable") {
    impact += 5;
  } else if (urgency === "Just capturing the idea for later") {
    impact -= 6;
    impactReasons.push("Low urgency — idea capture only");
  }

  if (str(answers, "Q14") === "Mostly waiting") {
    impact -= 5;
    flags.push("Most time is waiting — savings may need chasing/reminders in scope");
  }

  impact = clamp(impact);

  let feasibility = 0;

  const sameSteps = str(answers, "Q24");
  if (sameSteps === "Yes, same steps almost always") {
    feasibility += 25;
    feasibilityReasons.push("Highly repeatable steps");
  } else if (sameSteps === "Same overall, but exceptions come up") {
    feasibility += 15;
    feasibilityReasons.push("Mostly repeatable with exceptions");
  } else {
    feasibility += 4;
    feasibilityReasons.push("High judgment — depends on situation");
    flags.push("High judgment involved — full automation unlikely");
  }

  const exceptions = str(answers, "Q25");
  const excMap: Record<string, number> = {
    "Rarely — most items are straightforward": 20,
    "Sometimes — maybe 1 in 5": 14,
    "Often — maybe 1 in 3": 6,
    "Almost every item is different": 0,
  };
  feasibility += excMap[exceptions] ?? 8;
  if (exceptions === "Almost every item is different") {
    flags.push("Most items need judgment — automate happy path only");
  }

  const excHandling = str(answers, "Q26");
  if (excHandling === "Follow a written exception rule") {
    feasibility += 8;
    feasibilityReasons.push("Written exception rules exist");
  } else if (excHandling.includes("judgment")) {
    feasibility -= 4;
  }

  const dataShape = str(answers, "Q27");
  if (dataShape.startsWith("Tables")) {
    feasibility += 15;
    feasibilityReasons.push("Structured data (tables and fields)");
  } else if (dataShape.startsWith("A mix")) {
    feasibility += 9;
  } else {
    feasibility += 3;
    feasibilityReasons.push("Unstructured data — needs examples");
    flags.push("Mostly unstructured — example files needed");
  }

  const docs = str(answers, "Q28");
  if (docs === "Almost never") {
    feasibility += 12;
  } else if (docs === "Sometimes") {
    feasibility += 7;
    const layout = str(answers, "Q29");
    if (layout === "Same template / same layout") feasibility += 5;
    else if (layout === "All different") {
      feasibility -= 4;
      flags.push("Variable document layouts");
    }
  } else {
    feasibility += 2;
    flags.push("Document-heavy work — sample files required");
    const layout = str(answers, "Q29");
    if (layout === "Same template / same layout") feasibility += 6;
    else if (layout === "All different") feasibility -= 6;
    const lang = str(answers, "Q30");
    if (lang === "Regularly") {
      feasibility -= 4;
      flags.push("Mixed language/format documents");
    }
  }

  const movement = str(answers, "Q31");
  if (movement === "I copy and paste") {
    feasibility += 14;
    feasibilityReasons.push("Copy-paste between tools — classic automation target");
  } else if (movement.includes("download")) {
    feasibility += 12;
    feasibilityReasons.push("File transfer between systems");
  } else if (movement === "I re-type it") {
    feasibility += 10;
    feasibilityReasons.push("Re-keying data — strong automation candidate");
  } else if (movement.includes("already pass")) {
    feasibility += 6;
    feasibilityReasons.push("Some integration exists — remaining pain may be checks/exceptions");
  } else {
    feasibility += 8;
  }

  const stability = str(answers, "Q32");
  if (stability === "Stable") {
    feasibility += 10;
  } else if (stability === "Small tweaks") {
    feasibility += 7;
  } else if (stability === "Changed quite a bit") {
    feasibility += 3;
    flags.push("Process recently changed");
  } else {
    feasibility += 0;
    flags.push("Process being redesigned — park build until stable");
  }

  const discovery = str(answers, "Q45");
  if (discovery === "Both") {
    feasibility += 10;
    feasibilityReasons.push("Can demo and share examples");
  } else if (discovery.includes("walk") || discovery.includes("share")) {
    feasibility += 7;
    feasibilityReasons.push("Discovery-ready");
  } else {
    feasibility += 1;
    flags.push("Cannot easily share examples — feasibility capped");
  }

  const tools = arr(answers, "Q21");
  if (tools.length <= 2) {
    feasibility += 5;
    feasibilityReasons.push("Few tools involved");
  } else if (tools.length <= 4) {
    feasibility += 2;
  } else {
    feasibility -= 3;
    flags.push(`${tools.length} tools involved — integration complexity`);
  }

  const howDone = str(answers, "Q10");
  if (howDone.includes("Excel macros")) {
    feasibility += 4;
    feasibilityReasons.push("Existing macros/templates — rules to harvest");
  }
  if (howDone.includes("stalled")) {
    feasibility -= 3;
    flags.push("Previous improvement attempt stalled");
  }

  if (validationType.includes("fixed rule")) {
    feasibility += 8;
    feasibilityReasons.push("Checklist or rule-based validation");
  } else if (validationType.includes("Two systems")) {
    feasibility += 10;
    feasibilityReasons.push("Compare two sources — classic automation pattern");
  } else if (validationType.includes("prior period")) {
    feasibility += 6;
    feasibilityReasons.push("Period-over-period comparison");
  } else if (validationType.includes("needs judgment")) {
    feasibility -= 4;
    flags.push("Validation needs judgment — automate flagging, not deciding");
  }

  const practitioner = str(answers, "Q3");
  if (practitioner === "Yes, I do it regularly") {
    feasibility += 5;
  } else if (practitioner.includes("heard about")) {
    feasibility -= 5;
    flags.push("Submitter has not done the work — verify with practitioner");
  }

  const requestedScope = arr(answers, "Q42");
  if (
    requestedScope.includes("The whole process, end to end") &&
    sameSteps !== "Yes, same steps almost always"
  ) {
    feasibility -= 5;
    flags.push("End-to-end requested but process is not fully repeatable");
  }

  feasibility = clamp(feasibility);

  let risk = 0;
  const knowHow = str(answers, "Q35");
  if (knowHow === "Only 1") {
    risk += 35;
    riskReasons.push("Only one person knows the full process");
    flags.push("Key-person risk: only 1 knows how");
  } else if (knowHow === "2") {
    risk += 25;
    riskReasons.push("Only two people know the full process");
    flags.push("Key-person risk: only 2 know how");
  } else if (knowHow === "3–5") {
    risk += 12;
  } else {
    risk += 4;
  }

  const cover = str(answers, "Q36");
  if (cover === "It waits until they are back") {
    risk += 15;
    riskReasons.push("Work stops when key person is away");
  } else if (cover === "We scramble / quality drops") {
    risk += 20;
    riskReasons.push("Cover failure causes quality issues");
  }

  const sensitive = arr(answers, "Q38").filter((s) => s !== "None of these");
  if (sensitive.length > 0) {
    risk += 10 + sensitive.length * 5;
    riskReasons.push(`Sensitive data: ${sensitive.join(", ")}`);
    flags.push("Compliance controls needed");
  }

  const pains = arr(answers, "Q33");
  if (pains.includes("Only one or two people know how")) {
    risk += 8;
  }

  risk = clamp(risk);

  let confidenceScore = 70;
  if (practitioner === "Yes, I do it regularly") {
    confidenceScore += 15;
    confidenceReasons.push("Submitter does the work regularly");
  } else if (practitioner.includes("heard about")) {
    confidenceScore -= 25;
    confidenceReasons.push("Second-hand description");
  } else if (practitioner.includes("manage")) {
    confidenceScore -= 5;
  }

  if (discovery === "Not easily") {
    confidenceScore -= 20;
    confidenceReasons.push("Cannot share examples yet");
  } else if (discovery === "Both") {
    confidenceScore += 10;
  }

  const steps = arr(answers, "Q20");
  if (steps.filter(Boolean).length >= 3) {
    confidenceScore += 8;
    confidenceReasons.push("Process steps provided");
  } else {
    confidenceScore -= 10;
    confidenceReasons.push("Process steps are vague");
  }

  const guess = str(answers, "Q18");
  const guessHrs = weeklyGuessHours(guess);
  if (guessHrs !== null && hoursPerWeek > 0) {
    const ratio = guessHrs / hoursPerWeek;
    if (ratio > 2.5 || ratio < 0.4) {
      confidenceScore -= 15;
      flags.push("Weekly time guess does not match calculated volume");
      confidenceReasons.push("Time estimates inconsistent — sense-check needed");
    } else {
      confidenceScore += 5;
      confidenceReasons.push("Time estimates align");
    }
  }

  confidenceScore = clamp(confidenceScore);
  const confidence: Confidence =
    confidenceScore >= 70 ? "high" : confidenceScore >= 45 ? "medium" : "low";

  let bucket: Bucket;
  const redesigning = stability === "We are redesigning it now";

  if (redesigning) {
    bucket = "park";
    feedback.push(
      "The process is being redesigned. We have logged this, but it is usually better to stabilise how work should flow before automating.",
    );
  } else if (impact >= 60 && feasibility >= 60 && confidence !== "low") {
    bucket = "do-first";
    feedback.push(
      "This looks like a strong candidate: meaningful impact and a repeatable path. Next step is a short walkthrough, then a build estimate.",
    );
  } else if (impact >= 60 && (feasibility < 60 || confidence === "low")) {
    bucket = "investigate";
    feedback.push(
      "This could be valuable, but we need examples or a live run-through before we can say how automatable it is.",
    );
  } else if (impact < 60 && feasibility >= 60) {
    bucket = "easy-win";
    feedback.push(
      "This looks straightforward. It may not be the highest-value item, but it could be a quick win if you have spare capacity.",
    );
  } else {
    bucket = "park";
    feedback.push(
      "We have captured this. It is not a first automation target — either the value is limited, or the process needs more discovery.",
    );
  }

  if (knowHow === "Only 1" || knowHow === "2") {
    feedback.push(
      "Key-person risk is elevated. Even if this is not the biggest time-saver, making it teachable or automatable reduces operational risk.",
    );
  }

  if (str(answers, "Q14") === "Mostly waiting") {
    feedback.push(
      "A lot of the time cost is waiting on other people. Automating reminders and handoffs may help more than automating typing.",
    );
  }

  if (
    sameSteps === "It depends a lot on the situation" &&
    requestedScope.includes("The whole process, end to end")
  ) {
    feedback.push(
      "Full end-to-end replacement is unlikely as a first step. Checking, data movement, or the happy path is the realistic starting slice.",
    );
  }

  if (docs !== "Almost never" && discovery === "Not easily") {
    feedback.push(
      "Feasibility is limited until we see real document examples. The work may still be worth it, but we cannot estimate from a description alone.",
    );
  }

  const recommendedScope = deriveRecommendedScope(answers);

  return {
    impactScore: impact,
    feasibilityScore: feasibility,
    riskScore: risk,
    confidence,
    bucket,
    bucketLabel: bucketLabel(bucket),
    hoursPerYear: Math.round(hoursPerYear),
    hoursPerWeek: Math.round(hoursPerWeek * 10) / 10,
    recommendedScope,
    flags: [...new Set(flags)],
    feedback,
    reasons: {
      impact: impactReasons,
      feasibility: feasibilityReasons,
      risk: riskReasons,
      confidence: confidenceReasons,
    },
  };
}
