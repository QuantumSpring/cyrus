import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { WriteStream } from "node:fs";
import {
	createLogger,
	type ILogger,
	type LogContext,
	type LogLevel,
} from "cyrus-core";

// Re-export LogLevel from cyrus-core so existing consumers don't break
export { LogLevel } from "cyrus-core";

/**
 * Logger configuration options
 */
export interface LoggerOptions {
	/** Minimum log level to output */
	level?: LogLevel;
	/** Prefix to add to all log messages (used as component name) */
	prefix?: string;
	/** Whether to include timestamps */
	timestamps?: boolean;
	/** Directory to write log files to (e.g. ~/.cyrus/logs) */
	logDir?: string;
	/** Existing file stream to write to (used by child loggers) */
	logStream?: WriteStream;
}

/**
 * CLI-specific logger that wraps the core ILogger.
 *
 * Provides CLI-presentation features (emoji formatting, raw output,
 * dividers, child loggers) on top of the standard core logging interface.
 *
 * Implements ILogger so it can be passed to packages that expect the core interface.
 */
export class Logger implements ILogger {
	private coreLogger: ILogger;
	private prefix: string;
	private timestamps: boolean;
	private logStream?: WriteStream;

	constructor(options: LoggerOptions = {}) {
		this.prefix = options.prefix ?? "";
		this.timestamps = options.timestamps ?? false;
		this.coreLogger = createLogger({
			component: this.prefix || "CLI",
			level: options.level,
		});

		if (options.logStream) {
			this.logStream = options.logStream;
		} else if (options.logDir) {
			this.initLogFile(options.logDir);
		}
	}

	private initLogFile(logDir: string): void {
		try {
			if (!existsSync(logDir)) {
				mkdirSync(logDir, { recursive: true });
			}
			const timestamp = new Date()
				.toISOString()
				.replace(/[:.]/g, "-");
			const logPath = join(logDir, `cyrus-${timestamp}.log`);
			this.logStream = createWriteStream(logPath, { flags: "a" });
			console.log(`📝 Logging to ${logPath}`);
		} catch (error) {
			console.error(
				`Failed to initialize log file: ${(error as Error).message}`,
			);
		}
	}

	private writeToFile(message: string): void {
		if (this.logStream) {
			const ts = new Date().toISOString();
			this.logStream.write(`${ts} ${message}\n`);
		}
	}

	/**
	 * Debug log (lowest priority)
	 */
	debug(message: string, ...args: any[]): void {
		this.coreLogger.debug(message, ...args);
		this.writeToFile(`[DEBUG] ${message}`);
	}

	/**
	 * Info log (normal priority)
	 */
	info(message: string, ...args: any[]): void {
		this.coreLogger.info(message, ...args);
		this.writeToFile(`[INFO] ${message}`);
	}

	/**
	 * Success log - maps to info level with check mark prefix
	 */
	success(message: string, ...args: any[]): void {
		this.coreLogger.info(message, ...args);
		this.writeToFile(`[OK] ${message}`);
	}

	/**
	 * Warning log
	 */
	warn(message: string, ...args: any[]): void {
		this.coreLogger.warn(message, ...args);
		this.writeToFile(`[WARN] ${message}`);
	}

	/**
	 * Error log (highest priority)
	 */
	error(message: string, ...args: any[]): void {
		this.coreLogger.error(message, ...args);
		this.writeToFile(`[ERROR] ${message}`);
	}

	/**
	 * Raw output without formatting (always outputs regardless of level)
	 */
	raw(message: string, ...args: any[]): void {
		console.log(message, ...args);
		this.writeToFile(message);
	}

	/**
	 * Create a child logger with a prefix
	 */
	child(prefix: string): Logger {
		return new Logger({
			level: this.coreLogger.getLevel(),
			prefix: this.prefix ? `${this.prefix}:${prefix}` : prefix,
			timestamps: this.timestamps,
			logStream: this.logStream,
		});
	}

	/**
	 * Print a divider line
	 */
	divider(length = 70): void {
		this.raw("\u2500".repeat(length));
	}

	/**
	 * Create a new logger with additional context.
	 * Delegates to the core logger's withContext.
	 */
	withContext(context: LogContext): ILogger {
		return this.coreLogger.withContext(context);
	}

	/**
	 * Set log level dynamically
	 */
	setLevel(level: LogLevel): void {
		this.coreLogger.setLevel(level);
	}

	/**
	 * Get current log level
	 */
	getLevel(): LogLevel {
		return this.coreLogger.getLevel();
	}
}

/**
 * Default logger instance
 */
export const logger = new Logger();
