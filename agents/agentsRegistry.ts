import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface AgentDefinition {
  name: string;
  description?: string;
  client: string;
  model: string;
  system_prompt: string;
  main_goal?: string;
  personality?: string;
  dynamic_variables?: Record<string, string>;
  output_schema?: any;
  tools?: any[];
}

interface PersonalityDefinition {
  [key: string]: string;
}

// Original fallback directory
const PACKAGE_AGENTS_DIR = path.resolve(__dirname);
// Detect local agents directory near user's cwd or importing file
const localCandidates = [
  path.resolve(process.cwd(), 'src', 'agents'),
  path.resolve(process.cwd(), 'agents')
];

let detectedLocalAgentsDir: string | null = null;
for (const candidate of localCandidates) {
  if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
    detectedLocalAgentsDir = candidate;
    break;
  }
}

// Check environment variables for overrides
const CUSTOM_AGENTS_DIR = process.env.AGENTS_DIR
  ? path.resolve(process.env.AGENTS_DIR)
  : (detectedLocalAgentsDir ? detectedLocalAgentsDir : PACKAGE_AGENTS_DIR);

const CUSTOM_PERSONALITY_PATH = process.env.PERSONALITY_PATH 
  ? path.resolve(process.env.PERSONALITY_PATH) 
  : path.join(CUSTOM_AGENTS_DIR, 'personality.yaml');

let personality: PersonalityDefinition | null = null;

export function loadPersonality(): PersonalityDefinition {
  if (personality) return personality;
  if (!fs.existsSync(CUSTOM_PERSONALITY_PATH)) {
    // No custom personality found in AGENTS_DIR, do not load any personality.
    personality = {}; // Initialize as empty object
  } else {
    personality = yaml.load(fs.readFileSync(CUSTOM_PERSONALITY_PATH, 'utf8')) as PersonalityDefinition;
  }
  return personality;
}

function resolvePlaceholdersInAgent(raw: AgentDefinition): AgentDefinition {
  const personalityDef = loadPersonality();

  function resolvePlaceholders(value: string): string {
    const fromPersonalityMatch = value.match(/{{from_personality:(.*?)}}/);
    if (fromPersonalityMatch) {
      const varName = fromPersonalityMatch[1].trim();
      if (!(varName in personalityDef)) {
        // Personality variable not found, replace placeholder with empty string
        console.warn(`Personality variable "${varName}" not found in personality.yaml`);
        return value.replace(fromPersonalityMatch[0], '');
      }
      return value.replace(fromPersonalityMatch[0], personalityDef[varName]);
    }
    return value;
  }

  // Process dynamic_variables in agent YAML
  if (raw.dynamic_variables) {
    for (const [key, val] of Object.entries(raw.dynamic_variables)) {
      if (typeof val === 'string') {
        raw.dynamic_variables[key] = resolvePlaceholders(val);
      }
    }
  }

  // Also resolve placeholders in system_prompt, main_goal, and personality if present
  if (raw.system_prompt) {
    raw.system_prompt = resolvePlaceholders(raw.system_prompt);
  }
  if (raw.main_goal) {
    raw.main_goal = resolvePlaceholders(raw.main_goal);
  }
  if (raw.personality) {
    raw.personality = resolvePlaceholders(raw.personality);
  }

  // Ensure personality and main_goal are added to dynamic_variables
  if (raw.personality) {
    raw.dynamic_variables = raw.dynamic_variables || {};
    raw.dynamic_variables['personality'] = raw.personality;
  }

  if (raw.main_goal) {
    raw.dynamic_variables = raw.dynamic_variables || {};
    raw.dynamic_variables['main_goal'] = raw.main_goal;
  }

  return raw;
}

/**
 * Load an agent definition directly from a given file path.
 * If file not found or invalid, throws an error.
 */
export function loadAgentFromFile(configPath: string): AgentDefinition {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Agent YAML definition not found: ${configPath}`);
  }
  const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as AgentDefinition;
  return resolvePlaceholdersInAgent(raw);
}

/**
 * Load an agent definition by agentName, or fallback.
 * If agentName is provided, tries CUSTOM_AGENTS_DIR first, then PACKAGE_AGENTS_DIR.
 * If agentName is 'TerminalAgent' or 'ChatAgent' and not found in custom dir, fallback to package's built-in.
 */
export function loadAgentDefinition(agentName: string): AgentDefinition {
  // Attempt to load agent from CUSTOM_AGENTS_DIR first
  let agentPath = path.join(CUSTOM_AGENTS_DIR, `${agentName}.yaml`);
  if (!fs.existsSync(agentPath)) {
    // If not found, fallback to package's built-in agents
    agentPath = path.join(PACKAGE_AGENTS_DIR, `${agentName}.yaml`);
    if (!fs.existsSync(agentPath)) {
      throw new Error(`Agent YAML definition not found in custom or package directories: ${agentName}.yaml`);
    }
  }

  return loadAgentFromFile(agentPath);
}