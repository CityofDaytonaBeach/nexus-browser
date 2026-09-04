import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const levelMap: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

class Logger {
  private level: LogLevel = LogLevel.INFO;
  private prefix: string;

  constructor(prefix: string = 'Nexus') {
    this.prefix = prefix;
    const envLevel = process.env.LOG_LEVEL || 'info';
    this.level = levelMap[envLevel] ?? LogLevel.INFO;
  }

  private timestamp(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
  }

  debug(...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(chalk.gray(`[${this.timestamp()}] [${this.prefix}]`), ...args);
    }
  }

  info(...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(chalk.cyan(`[${this.timestamp()}] [${this.prefix}]`), ...args);
    }
  }

  warn(...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.log(chalk.yellow(`[${this.timestamp()}] [${this.prefix}] WARN:`), ...args);
    }
  }

  error(...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.log(chalk.red(`[${this.timestamp()}] [${this.prefix}] ERROR:`), ...args);
    }
  }

  child(prefix: string): Logger {
    const l = new Logger(`${this.prefix}:${prefix}`);
    l.level = this.level;
    return l;
  }
}

export const createLogger = (prefix: string) => new Logger(prefix);
