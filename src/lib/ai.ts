import { supabase } from "./supabase";

export interface AIRequestPayload {
  workspace_id: string;
  feature_name: string;
  userInstruction: string;
  systemInstruction?: string;
  context?: string;
  model_override?: string;
  temperature?: number;
  maxTokens?: number;
  related_record_id?: string;
  module_name?: string;
}

export interface AIResponse {
  success: boolean;
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  };
  error?: string;
}

export async function generateAIContent(payload: AIRequestPayload): Promise<AIResponse> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    throw new Error("Authentication required");
  }

  // Use the supabase functions url
  const { data, error } = await supabase.functions.invoke('ai-generate', {
    body: payload,
  });

  if (error) {
    throw new Error(error.message || "Failed to generate AI content");
  }

  return data;
}
