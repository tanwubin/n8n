import {
	AddConnectionCommand,
	AddNodeCommand,
	BulkCommand,
	EnableNodeToggleCommand,
	RemoveNodeCommand,
	type Undoable,
} from '@/models/history';
import { useHistoryStore } from '@/stores/history.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useWorkflowsStore } from '@/stores/workflows.store';
import { type CanvasNodeDirtiness } from '@/types';
import { type INodeConnections, NodeConnectionType } from 'n8n-workflow';
import { computed } from 'vue';

/**
 * Does the command make the given node dirty?
 */
function shouldCommandMarkDirty(
	command: Undoable,
	nodeName: string,
	nodeLastRanAt: number,
	getIncomingConnections: (nodeName: string) => INodeConnections,
): boolean {
	if (nodeLastRanAt > command.getTimestamp()) {
		return false;
	}

	if (command instanceof BulkCommand) {
		return command.commands.some((cmd) =>
			shouldCommandMarkDirty(cmd, nodeName, nodeLastRanAt, getIncomingConnections),
		);
	}

	if (command instanceof AddConnectionCommand) {
		return command.connectionData[1]?.node === nodeName;
	}

	if (
		command instanceof RemoveNodeCommand ||
		command instanceof AddNodeCommand ||
		command instanceof EnableNodeToggleCommand
	) {
		const commandTargetNodeName =
			command instanceof RemoveNodeCommand || command instanceof AddNodeCommand
				? command.node.name
				: command.nodeName;

		return Object.entries(getIncomingConnections(nodeName)).some(([type, nodeInputConnections]) => {
			switch (type as NodeConnectionType) {
				case NodeConnectionType.Main:
					return nodeInputConnections.some((connections) =>
						connections?.some((connection) => connection.node === commandTargetNodeName),
					);
				default:
					return false;
			}
		});
	}

	return false;
}

/**
 * Determines the subgraph that is affected by changes made after the last (partial) execution
 */
export function useNodeDirtiness() {
	const historyStore = useHistoryStore();
	const workflowsStore = useWorkflowsStore();
	const settingsStore = useSettingsStore();

	const dirtinessByName = computed(() => {
		// Do not highlight dirtiness if new partial execution is not enabled
		if (settingsStore.partialExecutionVersion === 1) {
			return {};
		}

		const dirtiness: Record<string, CanvasNodeDirtiness | undefined> = {};
		const runDataByNode = workflowsStore.getWorkflowRunData ?? {};

		function shouldMarkDirty(command: Undoable, nodeName: string, nodeLastRanAt: number) {
			return shouldCommandMarkDirty(
				command,
				nodeName,
				nodeLastRanAt,
				workflowsStore.incomingConnectionsByNodeName,
			);
		}

		function getRunAt(nodeName: string): number {
			return Math.max(
				...Object.entries(workflowsStore.outgoingConnectionsByNodeName(nodeName))
					.filter(([type]) => (type as NodeConnectionType) !== NodeConnectionType.Main)
					.flatMap(([, conn]) => conn.flat())
					.map((conn) => (conn ? getRunAt(conn.node) : 0)),
				runDataByNode[nodeName]?.[0]?.startTime ?? 0,
			);
		}

		for (const node of workflowsStore.allNodes) {
			const nodeName = node.name;
			const runAt = getRunAt(nodeName);

			if (!runAt) {
				continue;
			}

			const parametersLastUpdate = workflowsStore.getParametersLastUpdate(nodeName) ?? 0;

			if (parametersLastUpdate > runAt) {
				dirtiness[nodeName] = 'parameters-updated';
				continue;
			}

			if (historyStore.undoStack.some((command) => shouldMarkDirty(command, nodeName, runAt))) {
				dirtiness[nodeName] = 'incoming-connections-updated';
				continue;
			}

			const pinnedDataUpdatedAt = workflowsStore.getPinnedDataLastUpdate(nodeName) ?? 0;

			if (pinnedDataUpdatedAt > runAt) {
				dirtiness[nodeName] = 'pinned-data-updated';
				continue;
			}
		}

		return dirtiness;
	});

	return { dirtinessByName };
}
