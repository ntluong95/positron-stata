import * as http from 'http';
import * as https from 'https';

export interface HealthStatus {
	status: string;
	service: string;
	version: string;
	stata_available: boolean;
}

export interface DataViewResponse {
	status: string;
	message?: string;
	data: Array<Array<unknown>>;
	columns: string[];
	column_labels?: Record<string, string>;
	dtypes: Record<string, string>;
	rows: number;
	index: number[];
	total_rows: number;
	displayed_rows: number;
	max_rows: number;
}

export interface WorkingDirectoryResponse {
	status: string;
	message?: string;
	directory?: string;
}

export interface GraphDescriptor {
	name: string;
	path: string;
}

export interface StreamingRequest {
	completion: Promise<void>;
	abort: () => void;
}

export interface StreamRequestOptions {
	readonly path: string;
	readonly query?: Record<string, string | number | undefined>;
	readonly timeoutMs?: number;
	readonly onMessage: (message: string) => void;
}

export const STREAM_ABORTED_ERROR = 'positron-stata-mcp-stream-aborted';

function buildQueryString(query: Record<string, string | number | undefined> = {}): string {
	const searchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null || value === '') {
			continue;
		}
		searchParams.append(key, String(value));
	}
	const serialized = searchParams.toString();
	return serialized ? `?${serialized}` : '';
}

function parseSseDataLine(line: string): string | undefined {
	if (!line.startsWith('data:')) {
		return undefined;
	}

	const rawData = line.slice(5);
	// SSE allows exactly one optional space after "data:".
	// Preserve any additional leading spaces to keep table alignment.
	return rawData.startsWith(' ') ? rawData.slice(1) : rawData;
}

function collectResponse(response: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let body = '';
		response.setEncoding('utf8');
		response.on('data', chunk => {
			body += chunk;
		});
		response.on('end', () => resolve(body));
		response.on('error', reject);
	});
}

export function isStreamAbortError(error: unknown): boolean {
	return error instanceof Error && error.message === STREAM_ABORTED_ERROR;
}

export class StataServerClient {
	private readonly _baseUrl: URL;

	constructor(
		private readonly _host: string,
		private readonly _port: number,
	) {
		this._baseUrl = new URL(`http://${this._host}:${this._port}`);
	}

	async health(): Promise<HealthStatus> {
		return this.requestJson<HealthStatus>('GET', '/health');
	}

	async getHelpHtml(topic: string): Promise<string> {
		return this.requestText('GET', '/help', {
			topic,
			format: 'html',
		});
	}

	async getData(
		ifCondition: string | undefined,
		maxRows: number,
		sessionId?: string,
	): Promise<DataViewResponse> {
		return this.requestJson<DataViewResponse>('GET', '/view_data', {
			if_condition: ifCondition,
			max_rows: maxRows,
			session_id: sessionId,
		});
	}

	async getWorkingDirectory(
		sessionId?: string,
		workingDirectory?: string,
	): Promise<WorkingDirectoryResponse> {
		return this.requestJson<WorkingDirectoryResponse>('GET', '/working_directory', {
			session_id: sessionId,
			working_dir: workingDirectory,
		});
	}

	async stopExecution(sessionId?: string): Promise<void> {
		await this.requestJson('POST', '/stop_execution', {
			session_id: sessionId,
		});
	}

	async destroySession(sessionId: string): Promise<void> {
		await this.requestJson('DELETE', `/sessions/${encodeURIComponent(sessionId)}`);
	}

	async runSelectionText(selection: string, sessionId?: string): Promise<string> {
		return this.requestText('POST', '/run_selection', {
			selection,
			session_id: sessionId,
		});
	}

	runSelectionStream(
		selection: string,
		timeoutSeconds: number,
		sessionId: string | undefined,
		workingDirectory: string | undefined,
		onMessage: (message: string) => void,
	): StreamingRequest {
		return this.openStream({
			path: '/run_selection/stream',
			query: {
				selection,
				timeout: timeoutSeconds,
				session_id: sessionId,
				working_dir: workingDirectory,
			},
			timeoutMs: (timeoutSeconds * 1000) + 10000,
			onMessage,
		});
	}

	runFileStream(
		filePath: string,
		timeoutSeconds: number,
		sessionId: string | undefined,
		workingDirectory: string | undefined,
		onMessage: (message: string) => void,
	): StreamingRequest {
		return this.openStream({
			path: '/run_file/stream',
			query: {
				file_path: filePath,
				timeout: timeoutSeconds,
				session_id: sessionId,
				working_dir: workingDirectory,
			},
			timeoutMs: (timeoutSeconds * 1000) + 10000,
			onMessage,
		});
	}

	private requestText(
		method: string,
		requestPath: string,
		query?: Record<string, string | number | undefined>,
	): Promise<string> {
		return new Promise((resolve, reject) => {
			const url = new URL(`${requestPath}${buildQueryString(query)}`, this._baseUrl);
			const transport = url.protocol === 'https:' ? https : http;
			const request = transport.request(url, { method }, async response => {
				const statusCode = response.statusCode || 500;
				const body = await collectResponse(response);
				if (statusCode >= 200 && statusCode < 300) {
					resolve(body);
					return;
				}
				reject(new Error(body || `Request failed with HTTP ${statusCode}`));
			});
			request.on('error', reject);
			request.end();
		});
	}

	private async requestJson<T = unknown>(
		method: string,
		requestPath: string,
		query?: Record<string, string | number | undefined>,
	): Promise<T> {
		const text = await this.requestText(method, requestPath, query);
		return JSON.parse(text) as T;
	}

	private openStream(options: StreamRequestOptions): StreamingRequest {
		const url = new URL(`${options.path}${buildQueryString(options.query)}`, this._baseUrl);
		const transport = url.protocol === 'https:' ? https : http;
		let request: http.ClientRequest | undefined;

		const completion = new Promise<void>((resolve, reject) => {
			request = transport.request(url, {
				method: 'GET',
				headers: { Accept: 'text/event-stream' },
				timeout: options.timeoutMs,
			}, async response => {
				const statusCode = response.statusCode || 500;
				if (statusCode < 200 || statusCode >= 300) {
					const body = await collectResponse(response);
					reject(new Error(body || `Streaming request failed with HTTP ${statusCode}`));
					return;
				}

				let buffer = '';
				const flushBuffer = () => {
					const events = buffer.split('\n\n');
					buffer = events.pop() || '';
					for (const event of events) {
						for (const line of event.split('\n')) {
							const data = parseSseDataLine(line);
							if (data && data.length > 0) {
								options.onMessage(data);
							}
						}
					}
				};

				response.setEncoding('utf8');
				response.on('data', chunk => {
					buffer += chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
					flushBuffer();
				});
				response.on('end', () => {
					if (buffer.length > 0) {
						buffer += '\n\n';
						flushBuffer();
					}
					resolve();
				});
				response.on('error', reject);
			});

			request.on('timeout', () => {
				request?.destroy(new Error(`Request timed out after ${options.timeoutMs}ms`));
			});
			request.on('error', reject);
			request.end();
		});

		return {
			completion,
			abort: () => {
				request?.destroy(new Error(STREAM_ABORTED_ERROR));
			},
		};
	}
}
