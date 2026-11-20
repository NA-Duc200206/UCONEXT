export type LLMProviderName =
  | 'gemini'
  | 'openai'
  | 'groq'
  | 'openrouter'
  | 'deepseek'
  | 'ollama'
  | 'openai-compatible';

export interface LLMResolvedConfig {
  provider: LLMProviderName;
  protocol: 'gemini' | 'openai';
  apiKey: string;
  model: string;
  fallbackModels: string[];
  thinkingLevel?: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH';
  baseUrl: string;
  timeoutMs: number;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface LLMToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
}

export type LLMMessage =
  | { role: 'user'; content: string }
  | {
      role: 'assistant';
      content?: string;
      toolCalls?: LLMToolCall[];
      rawParts?: any[];
    }
  | {
      role: 'tool';
      toolCallId: string;
      name: string;
      result: unknown;
    };

export interface LLMCallParams {
  systemPrompt: string;
  messages: LLMMessage[];
  tools?: LLMToolDefinition[];
  temperature?: number;
  maxOutputTokens?: number;
  jsonMode?: boolean;
}

export interface LLMCompletionResult {
  text: string;
  toolCalls: LLMToolCall[];
  rawParts?: any[];
  provider: LLMProviderName;
  model: string;
}

export class LLMError extends Error {
  statusCode: number;
  code: string;
  provider?: string;
  model?: string;

  constructor(
    message: string,
    statusCode = 502,
    code = 'AI_UPSTREAM_ERROR',
    provider?: string,
    model?: string
  ) {
    super(message);
    this.name = 'LLMError';
    this.statusCode = statusCode;
    this.code = code;
    this.provider = provider;
    this.model = model;
  }
}

const VALID_PROVIDERS = new Set<LLMProviderName>([
  'gemini',
  'openai',
  'groq',
  'openrouter',
  'deepseek',
  'ollama',
  'openai-compatible'
]);

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizeOllamaBaseUrl(url: string): string {
  const clean = trimTrailingSlash(url);
  return clean.endsWith('/v1') ? clean : `${clean}/v1`;
}

export function resolveLLMConfig(env: NodeJS.ProcessEnv = process.env): LLMResolvedConfig {
  const rawTimeout = Number(env.AI_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(rawTimeout)
    ? Math.min(Math.max(rawTimeout, 5000), 60000)
    : 25000;

  const rawProvider = env.AI_PROVIDER?.trim().toLowerCase() || 'auto';
  const genericKey = env.AI_API_KEY?.trim() || '';
  const genericModel = env.AI_MODEL?.trim() || '';
  const genericBaseUrl = env.AI_BASE_URL?.trim() || '';

  let provider: LLMProviderName;
  if (rawProvider === 'auto' || rawProvider === '') {
    if (env.GEMINI_API_KEY?.trim()) {
      provider = 'gemini';
    } else if (env.OPENAI_API_KEY?.trim()) {
      provider = 'openai';
    } else if (env.GROQ_API_KEY?.trim()) {
      provider = 'groq';
    } else if (env.OPENROUTER_API_KEY?.trim()) {
      provider = 'openrouter';
    } else if (env.DEEPSEEK_API_KEY?.trim()) {
      provider = 'deepseek';
    } else if (genericKey && genericBaseUrl) {
      provider = 'openai-compatible';
    } else if (env.OLLAMA_BASE_URL?.trim()) {
      provider = 'ollama';
    } else {
      throw new LLMError(
        'AI model API is not configured. Add GEMINI_API_KEY, OPENAI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY, or OLLAMA_BASE_URL to backend/.env and restart the server.',
        503,
        'AI_NOT_CONFIGURED'
      );
    }
  } else if (VALID_PROVIDERS.has(rawProvider as LLMProviderName)) {
    provider = rawProvider as LLMProviderName;
  } else {
    throw new LLMError(
      `Unsupported AI_PROVIDER "${rawProvider}". Valid providers: gemini, openai, groq, openrouter, deepseek, ollama, openai-compatible.`,
      503,
      'AI_NOT_CONFIGURED'
    );
  }

  let protocol: 'gemini' | 'openai' = 'openai';
  let apiKey = '';
  let model = '';
  let baseUrl = '';

  switch (provider) {
    case 'gemini':
      protocol = 'gemini';
      apiKey = genericKey || env.GEMINI_API_KEY?.trim() || '';
      model = genericModel || env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite';
      baseUrl = trimTrailingSlash(genericBaseUrl || 'https://generativelanguage.googleapis.com/v1beta');
      break;
    case 'openai':
      apiKey = genericKey || env.OPENAI_API_KEY?.trim() || '';
      model = genericModel || env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
      baseUrl = trimTrailingSlash(genericBaseUrl || 'https://api.openai.com/v1');
      break;
    case 'groq':
      apiKey = genericKey || env.GROQ_API_KEY?.trim() || '';
      model = genericModel || env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile';
      baseUrl = trimTrailingSlash(genericBaseUrl || 'https://api.groq.com/openai/v1');
      break;
    case 'openrouter':
      apiKey = genericKey || env.OPENROUTER_API_KEY?.trim() || '';
      model = genericModel || env.OPENROUTER_MODEL?.trim() || 'google/gemini-2.5-flash';
      baseUrl = trimTrailingSlash(genericBaseUrl || 'https://openrouter.ai/api/v1');
      break;
    case 'deepseek':
      apiKey = genericKey || env.DEEPSEEK_API_KEY?.trim() || '';
      model = genericModel || env.DEEPSEEK_MODEL?.trim() || 'deepseek-chat';
      baseUrl = trimTrailingSlash(genericBaseUrl || 'https://api.deepseek.com/v1');
      break;
    case 'ollama':
      apiKey = genericKey || 'ollama';
      model = genericModel || env.OLLAMA_MODEL?.trim() || 'llama3.2';
      baseUrl = normalizeOllamaBaseUrl(genericBaseUrl || env.OLLAMA_BASE_URL?.trim() || 'http://localhost:11434/v1');
      break;
    case 'openai-compatible':
      apiKey = genericKey || env.OPENAI_API_KEY?.trim() || '';
      model = genericModel || env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';
      baseUrl = trimTrailingSlash(genericBaseUrl || 'https://api.openai.com/v1');
      break;
  }

  if (provider !== 'ollama' && !apiKey) {
    throw new LLMError(
      `AI model API is not configured for provider "${provider}". Please set its API key in backend/.env and restart the server.`,
      503,
      'AI_NOT_CONFIGURED',
      provider,
      model
    );
  }

  const rawFallbacks = env.AI_FALLBACK_MODELS?.split(',') || [];
  const seenFallbacks = new Set<string>([model]);
  const fallbackModels: string[] = [];
  for (const candidate of rawFallbacks) {
    const trimmed = candidate.trim();
    if (trimmed && !seenFallbacks.has(trimmed)) {
      seenFallbacks.add(trimmed);
      fallbackModels.push(trimmed);
    }
  }

  let thinkingLevel: 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | undefined;
  if (protocol === 'gemini') {
    const rawThinking = env.GEMINI_THINKING_LEVEL?.trim().toUpperCase() || '';
    if (rawThinking === 'DEFAULT' || rawThinking === 'OFF' || rawThinking === 'NONE') {
      thinkingLevel = undefined;
    } else if (
      rawThinking === 'MINIMAL' ||
      rawThinking === 'LOW' ||
      rawThinking === 'MEDIUM' ||
      rawThinking === 'HIGH'
    ) {
      thinkingLevel = rawThinking;
    } else {
      thinkingLevel = 'MINIMAL';
    }
  }

  return {
    provider,
    protocol,
    apiKey,
    model,
    fallbackModels,
    thinkingLevel,
    baseUrl,
    timeoutMs
  };
}

export function getLLMStatus(env: NodeJS.ProcessEnv = process.env): {
  configured: boolean;
  provider: LLMProviderName | null;
  model: string | null;
} {
  try {
    const cfg = resolveLLMConfig(env);
    return {
      configured: true,
      provider: cfg.provider,
      model: cfg.model
    };
  } catch {
    return {
      configured: false,
      provider: null,
      model: null
    };
  }
}

function buildHttpError(
  status: number,
  upstreamMsg: string,
  provider: LLMProviderName,
  model: string
): LLMError {
  const cleanMsg = upstreamMsg.replace(/AIza[A-Za-z0-9_-]{10,}/g, '[REDACTED]').slice(0, 260);
  if (status === 401 || status === 403) {
    return new LLMError(
      `Authentication failed for ${provider} (${model}): ${cleanMsg || 'invalid API key or permissions.'}`,
      502,
      'AI_AUTH_ERROR',
      provider,
      model
    );
  }
  if (status === 429) {
    return new LLMError(
      `Rate limit or quota exceeded for ${provider} (${model}). Please retry in a moment.`,
      429,
      'AI_RATE_LIMITED',
      provider,
      model
    );
  }
  if (status === 503) {
    return new LLMError(
      `AI model ${provider} (${model}) is temporarily experiencing high demand (503). Please try again shortly.`,
      503,
      'AI_OVERLOADED',
      provider,
      model
    );
  }
  return new LLMError(
    `AI provider ${provider} (${model}) error (${status}): ${cleanMsg || 'upstream request failed.'}`,
    502,
    'AI_UPSTREAM_ERROR',
    provider,
    model
  );
}

function extractUpstreamErrorMessage(bodyText: string, status: number): string {
  try {
    const parsed = JSON.parse(bodyText);
    const msg = parsed?.error?.message || parsed?.message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
  } catch {
    // Plain text fallback
  }
  return bodyText.trim() || `HTTP ${status}`;
}

async function callGemini(
  cfg: LLMResolvedConfig,
  params: LLMCallParams
): Promise<LLMCompletionResult> {
  const endpoint = `${cfg.baseUrl}/models/${encodeURIComponent(cfg.model)}:generateContent?key=${encodeURIComponent(cfg.apiKey)}`;

  const contents: any[] = [];
  for (let i = 0; i < params.messages.length; i++) {
    const msg = params.messages[i];
    if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }]
      });
    } else if (msg.role === 'assistant') {
      if (Array.isArray(msg.rawParts) && msg.rawParts.length > 0) {
        contents.push({
          role: 'model',
          parts: msg.rawParts
        });
      } else {
        const parts: any[] = [];
        if (msg.content) parts.push({ text: msg.content });
        if (Array.isArray(msg.toolCalls)) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.args || {}
              }
            });
          }
        }
        if (parts.length > 0) {
          contents.push({ role: 'model', parts });
        }
      }
    } else if (msg.role === 'tool') {
      const toolParts: any[] = [];
      let j = i;
      while (j < params.messages.length && params.messages[j].role === 'tool') {
        const toolMsg = params.messages[j] as Extract<LLMMessage, { role: 'tool' }>;
        toolParts.push({
          functionResponse: {
            name: toolMsg.name,
            response: { result: toolMsg.result ?? null }
          }
        });
        j++;
      }
      i = j - 1;
      contents.push({
        role: 'user',
        parts: toolParts
      });
    }
  }

  const body: Record<string, any> = {
    systemInstruction: { parts: [{ text: params.systemPrompt }] },
    contents,
    generationConfig: {
      temperature: params.temperature ?? 0.35,
      maxOutputTokens: params.maxOutputTokens ?? 700,
      ...(cfg.thinkingLevel && /^gemini-3/i.test(cfg.model)
        ? { thinkingConfig: { thinkingLevel: cfg.thinkingLevel } }
        : {}),
      ...(params.jsonMode && !params.tools?.length ? { responseMimeType: 'application/json' } : {})
    }
  };

  if (params.tools && params.tools.length > 0) {
    body.tools = [
      {
        functionDeclarations: params.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters
        }))
      }
    ];
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs)
    });
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new LLMError(
        `AI provider ${cfg.provider} (${cfg.model}) timed out after ${Math.round(cfg.timeoutMs / 1000)}s.`,
        504,
        'AI_TIMEOUT',
        cfg.provider,
        cfg.model
      );
    }
    throw new LLMError(
      `Failed to connect to ${cfg.provider} (${cfg.model}): ${err?.message || 'network error.'}`,
      502,
      'AI_UPSTREAM_ERROR',
      cfg.provider,
      cfg.model
    );
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw buildHttpError(
      response.status,
      extractUpstreamErrorMessage(errBody, response.status),
      cfg.provider,
      cfg.model
    );
  }

  const data: any = await response.json();
  const parts: any[] = data?.candidates?.[0]?.content?.parts || [];
  const textParts: string[] = [];
  const toolCalls: LLMToolCall[] = [];

  parts.forEach((part, idx) => {
    if (typeof part?.text === 'string' && part.text.trim() && !part.thought) {
      textParts.push(part.text);
    }
    if (part?.functionCall && typeof part.functionCall.name === 'string') {
      toolCalls.push({
        id: `gemini_fc_${idx}`,
        name: part.functionCall.name,
        args:
          part.functionCall.args && typeof part.functionCall.args === 'object'
            ? part.functionCall.args
            : {}
      });
    }
  });

  return {
    text: textParts.join('\n').trim(),
    toolCalls,
    rawParts: parts,
    provider: cfg.provider,
    model: cfg.model
  };
}

async function callOpenAICompatible(
  cfg: LLMResolvedConfig,
  params: LLMCallParams
): Promise<LLMCompletionResult> {
  const endpoint = `${cfg.baseUrl}/chat/completions`;

  const oaiMessages: any[] = [{ role: 'system', content: params.systemPrompt }];

  for (const msg of params.messages) {
    if (msg.role === 'user') {
      oaiMessages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      const entry: Record<string, any> = {
        role: 'assistant',
        content: msg.content || null
      };
      if (Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
        entry.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.args || {})
          }
        }));
      }
      oaiMessages.push(entry);
    } else if (msg.role === 'tool') {
      oaiMessages.push({
        role: 'tool',
        tool_call_id: msg.toolCallId,
        content: JSON.stringify(msg.result ?? null)
      });
    }
  }

  const body: Record<string, any> = {
    model: cfg.model,
    messages: oaiMessages,
    temperature: params.temperature ?? 0.35,
    max_tokens: params.maxOutputTokens ?? 700
  };

  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
    body.tool_choice = 'auto';
  } else if (params.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`
  };
  if (cfg.provider === 'openrouter') {
    headers['HTTP-Referer'] = process.env.CLIENT_URL || 'http://localhost:3000';
    headers['X-Title'] = 'UCONEXT';
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs)
    });
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new LLMError(
        `AI provider ${cfg.provider} (${cfg.model}) timed out after ${Math.round(cfg.timeoutMs / 1000)}s.`,
        504,
        'AI_TIMEOUT',
        cfg.provider,
        cfg.model
      );
    }
    throw new LLMError(
      `Failed to connect to ${cfg.provider} (${cfg.model}): ${err?.message || 'network error.'}`,
      502,
      'AI_UPSTREAM_ERROR',
      cfg.provider,
      cfg.model
    );
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw buildHttpError(
      response.status,
      extractUpstreamErrorMessage(errBody, response.status),
      cfg.provider,
      cfg.model
    );
  }

  const data: any = await response.json();
  const choiceMessage = data?.choices?.[0]?.message;
  const text = typeof choiceMessage?.content === 'string' ? choiceMessage.content.trim() : '';

  const toolCalls: LLMToolCall[] = Array.isArray(choiceMessage?.tool_calls)
    ? choiceMessage.tool_calls
        .filter((tc: any) => tc?.function?.name)
        .map((tc: any, idx: number) => {
          let parsedArgs: Record<string, any> = {};
          if (typeof tc.function.arguments === 'string' && tc.function.arguments.trim()) {
            try {
              parsedArgs = JSON.parse(tc.function.arguments);
            } catch {
              parsedArgs = {};
            }
          } else if (tc.function.arguments && typeof tc.function.arguments === 'object') {
            parsedArgs = tc.function.arguments;
          }
          return {
            id: String(tc.id || `oai_tc_${idx}`),
            name: String(tc.function.name),
            args: parsedArgs
          };
        })
    : [];

  return {
    text,
    toolCalls,
    provider: cfg.provider,
    model: cfg.model
  };
}

async function invokeModelOnce(
  cfg: LLMResolvedConfig,
  params: LLMCallParams
): Promise<LLMCompletionResult> {
  if (cfg.protocol === 'gemini') {
    return callGemini(cfg, params);
  }
  return callOpenAICompatible(cfg, params);
}

export async function callLLM(
  params: LLMCallParams,
  env: NodeJS.ProcessEnv = process.env
): Promise<LLMCompletionResult> {
  const cfg = resolveLLMConfig(env);
  const candidateModels = [cfg.model, ...cfg.fallbackModels];

  for (let i = 0; i < candidateModels.length; i++) {
    const modelCfg: LLMResolvedConfig = { ...cfg, model: candidateModels[i] };
    try {
      return await invokeModelOnce(modelCfg, params);
    } catch (err: any) {
      const isRetryable =
        err instanceof LLMError &&
        (err.code === 'AI_OVERLOADED' || err.code === 'AI_TIMEOUT');

      if (isRetryable && i < candidateModels.length - 1) {
        continue;
      }

      if (
        err instanceof LLMError &&
        err.code === 'AI_OVERLOADED' &&
        cfg.fallbackModels.length === 0
      ) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        return invokeModelOnce(modelCfg, params);
      }

      throw err;
    }
  }

  throw new LLMError(
    `AI provider ${cfg.provider} failed across all candidate models.`,
    502,
    'AI_UPSTREAM_ERROR',
    cfg.provider,
    cfg.model
  );
}

