import * as vscode from "vscode";

export interface StataExecutionCompletedEvent {
    sessionId: string;
}

const executionCompletedEmitter =
    new vscode.EventEmitter<StataExecutionCompletedEvent>();

export const onDidCompleteStataExecution = executionCompletedEmitter.event;

export function notifyStataExecutionCompleted(sessionId: string): void {
    executionCompletedEmitter.fire({ sessionId });
}
