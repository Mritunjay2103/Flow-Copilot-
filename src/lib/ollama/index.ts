import "server-only";

export { getOllamaConfig, OllamaConfigError, type OllamaConfig } from "./config";
export {
  chatStructured,
  checkOllamaHealth,
  OllamaClientError,
  type ChatMessage,
  type ChatStructuredResult,
} from "./client";
