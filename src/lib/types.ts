export type Bucket =
  | "do-first"
  | "investigate"
  | "easy-win"
  | "park";

export type Confidence = "high" | "medium" | "low";

export type FormAnswers = Record<string, string | string[]>;

export type ScoreResult = {
  impactScore: number;
  feasibilityScore: number;
  riskScore: number;
  confidence: Confidence;
  bucket: Bucket;
  bucketLabel: string;
  hoursPerYear: number;
  hoursPerWeek: number;
  recommendedScope: string;
  flags: string[];
  feedback: string[];
  reasons: {
    impact: string[];
    feasibility: string[];
    risk: string[];
    confidence: string[];
  };
};

export type Submission = {
  id: string;
  createdAt: string;
  answers: FormAnswers;
  score: ScoreResult;
};

export type QuestionType =
  | "text"
  | "email"
  | "textarea"
  | "number"
  | "single"
  | "multi"
  | "steps";

export type QuestionDef = {
  id: string;
  step: number;
  title: string;
  helper?: string;
  type: QuestionType;
  options?: string[];
  required: boolean;
  maxSelect?: number;
  placeholder?: string;
  showIf?: (answers: FormAnswers) => boolean;
};

export type StepDef = {
  id: number;
  name: string;
  description: string;
};
