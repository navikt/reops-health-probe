type LogLevel = "info" | "warn" | "error" | "debug";

interface LogMessage {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: unknown;
}

class Logger {
  private formatMessage(level: LogLevel, message: string, data?: unknown): string {
    const logMsg: LogMessage = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
    };
    return JSON.stringify(logMsg);
  }

  info(message: string, data?: unknown): void {
    console.log(this.formatMessage("info", message, data));
  }

  warn(message: string, data?: unknown): void {
    console.warn(this.formatMessage("warn", message, data));
  }

  error(message: string, error?: unknown): void {
    const errorData = error instanceof Error
      ? { message: error.message, stack: error.stack }
      : error;
    console.error(this.formatMessage("error", message, errorData));
  }

  debug(message: string, data?: unknown): void {
    if (Deno.env.get("DEBUG") === "true") {
      console.log(this.formatMessage("debug", message, data));
    }
  }
}

export const logger = new Logger();
