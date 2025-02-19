/* eslint-disable n8n-local-rules/no-unneeded-backticks */
import { createTestNode, createTestWorkflow, defaultNodeDescriptions } from '@/__tests__/mocks';
import { createComponentRenderer } from '@/__tests__/render';
import { useCanvasOperations } from '@/composables/useCanvasOperations';
import { useHistoryHelper } from '@/composables/useHistoryHelper';
import { useNodeDirtiness } from '@/composables/useNodeDirtiness';
import { type INodeUi } from '@/Interface';
import { useNodeTypesStore } from '@/stores/nodeTypes.store';
import { useSettingsStore } from '@/stores/settings.store';
import { useUIStore } from '@/stores/ui.store';
import { useWorkflowsStore } from '@/stores/workflows.store';
import { type FrontendSettings } from '@n8n/api-types';
import { createTestingPinia } from '@pinia/testing';
import { NodeConnectionType, type IConnections, type IRunData } from 'n8n-workflow';
import { defineComponent } from 'vue';
import {
	createRouter,
	createWebHistory,
	useRouter,
	type RouteLocationNormalizedLoaded,
} from 'vue-router';

describe(useNodeDirtiness, () => {
	let workflowsStore: ReturnType<typeof useWorkflowsStore>;
	let settingsStore: ReturnType<typeof useSettingsStore>;
	let historyHelper: ReturnType<typeof useHistoryHelper>;
	let canvasOperations: ReturnType<typeof useCanvasOperations>;
	let uiStore: ReturnType<typeof useUIStore>;

	const NODE_RUN_AT = new Date('2025-01-01T00:00:01');
	const WORKFLOW_UPDATED_AT = new Date('2025-01-01T00:00:10');

	beforeEach(() => {
		vi.useFakeTimers();

		const TestComponent = defineComponent({
			setup() {
				workflowsStore = useWorkflowsStore();
				settingsStore = useSettingsStore();
				historyHelper = useHistoryHelper({} as RouteLocationNormalizedLoaded);
				canvasOperations = useCanvasOperations({ router: useRouter() });
				uiStore = useUIStore();

				// Enable new partial execution
				settingsStore.settings = {
					partialExecution: { version: 2, enforce: true },
				} as FrontendSettings;
			},
			template: '<div />',
		});

		createComponentRenderer(TestComponent, {
			global: {
				plugins: [
					createTestingPinia({ stubActions: false, fakeApp: true }),
					createRouter({
						history: createWebHistory(),
						routes: [{ path: '/', component: TestComponent }],
					}),
				],
			},
		})();
	});

	it('should be an empty object if no change has been made to the workflow', () => {
		setupTestWorkflow('a✅, b✅, c✅');

		expect(useNodeDirtiness().dirtinessByName.value).toEqual({});
	});

	it('should return even if the connections forms a loop', () => {
		setupTestWorkflow('a✅ -> b✅ -> c -> d✅ -> b');

		expect(() => {
			canvasOperations.setNodeParameters('b', { foo: 1 });

			// eslint-disable-next-line @typescript-eslint/no-unused-expressions
			useNodeDirtiness().dirtinessByName.value;
		}).not.toThrow();
	});

	describe('injecting a node', () => {
		it("should mark a node as 'incoming-connections-updated' if a new node is injected as its parent", async () => {
			useNodeTypesStore().setNodeTypes(defaultNodeDescriptions);

			setupTestWorkflow('a✅ -> b✅');

			uiStore.lastInteractedWithNodeConnection = {
				source: 'a',
				target: 'b',
			};
			uiStore.lastInteractedWithNodeId = 'a';
			uiStore.lastInteractedWithNodeHandle = 'outputs/main/0';

			await canvasOperations.addNodes([createTestNode({ name: 'c' })], { trackHistory: true });

			expect(useNodeDirtiness().dirtinessByName.value).toEqual({
				b: 'incoming-connections-updated',
			});
		});
	});

	describe('deleting a node', () => {
		it("should mark a node as 'incoming-connections-updated' if parent node is deleted", async () => {
			useNodeTypesStore().setNodeTypes(defaultNodeDescriptions);

			setupTestWorkflow('a✅ -> b✅ -> c✅');

			canvasOperations.deleteNodes(['b'], { trackHistory: true });

			expect(useNodeDirtiness().dirtinessByName.value).toEqual({
				c: 'incoming-connections-updated',
			});
		});
	});

	describe('updating node parameters', () => {
		it("should mark a node as 'parameters-updated' if its parameter has changed", () => {
			setupTestWorkflow('a✅, b✅, c✅');

			canvasOperations.setNodeParameters('b', { foo: 1 });

			expect(useNodeDirtiness().dirtinessByName.value).toEqual({
				b: 'parameters-updated',
			});
		});

		it('should clear dirtiness if a dirty node gets new run data', () => {
			useNodeTypesStore().setNodeTypes(defaultNodeDescriptions);

			setupTestWorkflow('a✅ -> b✅ -> c✅');

			canvasOperations.setNodeParameters('b', { foo: 1 });

			const runAt = new Date(+WORKFLOW_UPDATED_AT + 1000);

			workflowsStore.setWorkflowExecutionData({
				id: workflowsStore.workflow.id,
				finished: true,
				mode: 'manual',
				status: 'success',
				workflowData: workflowsStore.workflow,
				startedAt: runAt,
				createdAt: runAt,
				data: {
					resultData: {
						runData: {
							b: [
								{
									startTime: +runAt,
									executionTime: 0,
									executionStatus: 'success',
									source: [],
								},
							],
						},
					},
				},
			});

			expect(useNodeDirtiness().dirtinessByName.value).toEqual({});
		});

		it("should not update dirtiness if the node hasn't run yet", () => {
			setupTestWorkflow('a✅, b, c✅');

			canvasOperations.setNodeParameters('b', { foo: 1 });

			expect(useNodeDirtiness().dirtinessByName.value).toEqual({});
		});
	});

	describe('adding a connection', () => {
		it("should mark a node as 'incoming-connections-updated' if a new incoming connection is added", () => {
			useNodeTypesStore().setNodeTypes(defaultNodeDescriptions);

			setupTestWorkflow('a✅ -> b✅ -> c✅');

			canvasOperations.createConnection({ source: 'a', target: 'c' }, { trackHistory: true });

			expect(useNodeDirtiness().dirtinessByName.value).toEqual({
				c: 'incoming-connections-updated',
			});
		});
	});

	describe('enabling/disabling nodes', () => {
		it('should mark downstream nodes dirty if the node is set to disabled', () => {
			setupTestWorkflow('a✅ -> b✅ -> c✅ -> d✅');

			canvasOperations.toggleNodesDisabled(['b'], {
				trackHistory: true,
			});

			expect(useNodeDirtiness().dirtinessByName.value).toEqual({
				c: 'incoming-connections-updated',
			});
		});

		it('should not mark anything dirty if a disabled node is set to enabled', () => {
			setupTestWorkflow('a✅ -> b🚫 -> c✅ -> d✅');

			canvasOperations.toggleNodesDisabled(['b'], {
				trackHistory: true,
			});

			expect(useNodeDirtiness().dirtinessByName.value).toEqual({});
		});

		it('should restore original dirtiness after undoing a command', async () => {
			setupTestWorkflow('a✅ -> b✅ -> c✅ -> d✅');

			canvasOperations.toggleNodesDisabled(['b'], {
				trackHistory: true,
			});
			await historyHelper.undo();

			expect(useNodeDirtiness().dirtinessByName.value).toEqual({});
		});
	});

	describe('pinned data', () => {
		it('should not change dirtiness when data is pinned', async () => {
			setupTestWorkflow('a✅ -> b✅ -> c✅');

			canvasOperations.toggleNodesPinned(['b'], 'pin-icon-click', {
				trackHistory: true,
			});

			expect(useNodeDirtiness().dirtinessByName.value).toEqual({});
		});

		it('should update dirtiness when pinned data is removed from a node with run data', async () => {
			setupTestWorkflow('a✅ -> b✅📌 -> c✅, b -> d, b -> e✅ -> f✅');

			canvasOperations.toggleNodesPinned(['b'], 'pin-icon-click', {
				trackHistory: true,
			});

			expect(useNodeDirtiness().dirtinessByName.value).toEqual({
				b: 'pinned-data-updated',
			});
		});

		it('should update dirtiness when an existing pinned data of an incoming node is updated', async () => {
			setupTestWorkflow('a✅ -> b✅📌 -> c✅, b -> d, b -> e✅ -> f✅');

			workflowsStore.pinData({ node: workflowsStore.nodesByName.b, data: [{ json: {} }] });

			expect(useNodeDirtiness().dirtinessByName.value).toEqual({
				// 'd' is not marked as pinned-data-updated because it has no run data.
				c: 'pinned-data-updated',
				e: 'pinned-data-updated',
			});
		});
	});

	describe('sub-nodes', () => {
		it('should mark its parent nodes with run data as dirty when parameters of a sub node has changed', () => {
			setupTestWorkflow('a✅ -> b✅ -> c✅, d🧠 -> b, e🧠 -> f✅🧠 -> b');

			canvasOperations.setNodeParameters('e', { foo: 1 });

			expect(useNodeDirtiness().dirtinessByName.value).toEqual({
				// 'e' itself is not marked as parameters-updated, because it has no run data.
				f: 'upstream-dirty',
				b: 'upstream-dirty',
			});
		});
	});

	/**
	 * Setup test data in the workflow store using given diagram.
	 *
	 * [Symbols]
	 * - ✅: Node with run data
	 * - 🚫: Disabled node
	 * - 📌: Node with pinned data
	 * - 🧠: A sub node
	 */
	function setupTestWorkflow(diagram: string) {
		const nodeNamesWithPinnedData = new Set<string>();
		const nodes: Record<string, INodeUi> = {};
		const connections: IConnections = {};
		const runData: IRunData = {};

		for (const subGraph of diagram.split(/\n|,/).filter((line) => line.trim() !== '')) {
			const elements = subGraph.split(/(->)/).map((s) => s.trim());

			elements.forEach((element, i, arr) => {
				if (element === '->') {
					const from = arr[i - 1].slice(0, 1);
					const to = arr[i + 1].slice(0, 1);
					const type = arr[i - 1].includes('🧠')
						? NodeConnectionType.AiAgent
						: NodeConnectionType.Main;
					const conns = connections[from]?.[type] ?? [];
					const conn = conns[0] ?? [];

					connections[from] = {
						...connections[from],
						[type]: [[...conn, { node: to, type, index: conn.length }], ...conns.slice(1)],
					};
					return;
				}

				const [name, ...attributes] = element.trim();

				nodes[name] =
					nodes[name] ??
					createTestNode({
						id: name,
						name,
						disabled: attributes.includes('🚫'),
					});

				if (attributes.includes('✅')) {
					runData[name] = [
						{
							startTime: +NODE_RUN_AT,
							executionTime: 0,
							executionStatus: 'success',
							source: [],
						},
					];
				}

				if (attributes.includes('📌')) {
					nodeNamesWithPinnedData.add(name);
				}
			});
		}

		const workflow = createTestWorkflow({ nodes: Object.values(nodes), connections });

		workflowsStore.setNodes(workflow.nodes);
		workflowsStore.setConnections(workflow.connections);

		for (const name of nodeNamesWithPinnedData) {
			workflowsStore.pinData({
				node: workflowsStore.nodesByName[name],
				data: [{ json: {} }],
			});
		}

		workflowsStore.setWorkflowExecutionData({
			id: workflow.id,
			finished: true,
			mode: 'manual',
			status: 'success',
			workflowData: workflow,
			startedAt: NODE_RUN_AT,
			createdAt: NODE_RUN_AT,
			data: { resultData: { runData } },
		});

		// prepare for making changes to the workflow
		vi.setSystemTime(WORKFLOW_UPDATED_AT);
	}
});
