import dagre from '@dagrejs/dagre';

import { useVueFlow, type GraphNode, type XYPosition } from '@vue-flow/core';
import { STICKY_NODE_TYPE } from '../constants';
import {
	CanvasNodeRenderType,
	type BoundingBox,
	type CanvasConnection,
	type CanvasNodeData,
} from '../types';
import { isPresent } from '../utils/typesUtils';
import { GRID_SIZE, NODE_SIZE } from '../utils/nodeViewUtils';

export type CanvasLayoutOptions = { id?: string };
export type CanvasLayoutTarget = 'selection' | 'all';
export type CanvasLayoutTargetData = {
	nodes: Array<GraphNode<CanvasNodeData>>;
	edges: CanvasConnection[];
};

export type NodeLayoutResult = {
	id: string;
	x: number;
	y: number;
	width?: number;
	height?: number;
};
export type LayoutResult = { boundingBox: BoundingBox; nodes: NodeLayoutResult[] };

export type CanvasNodeDictionary = Record<string, GraphNode<CanvasNodeData>>;

const NODE_X_SPACING = GRID_SIZE * 8;
const NODE_Y_SPACING = GRID_SIZE * 6;
const SUBGRAPH_SPACING = GRID_SIZE * 8;
const AI_X_SPACING = GRID_SIZE * 2;
const AI_Y_SPACING = GRID_SIZE * 6;
const STICKY_BOTTOM_PADDING = GRID_SIZE * 4;

export function useCanvasLayout({ id: canvasId }: CanvasLayoutOptions = {}) {
	const {
		findNode,
		getSelectedNodes,
		edges: allEdges,
		nodes: allNodes,
	} = useVueFlow({ id: canvasId });

	function getTargetData(target: CanvasLayoutTarget): CanvasLayoutTargetData {
		if (target === 'selection') {
			return { nodes: getSelectedNodes.value, edges: allEdges.value };
		}
		return { nodes: allNodes.value, edges: allEdges.value };
	}

	function sortNodePositions(nodeA: XYPosition, nodeB: XYPosition): number {
		const yDiff = nodeA.y - nodeB.y;
		return yDiff === 0 ? nodeA.x - nodeB.x : yDiff;
	}

	function createDagreGraph({ nodes, edges }: CanvasLayoutTargetData) {
		const graph = new dagre.graphlib.Graph();
		graph.setDefaultEdgeLabel(() => ({}));

		const graphNodes = nodes
			.map((node) => findNode<CanvasNodeData>(node.id))
			.filter(isPresent)
			.sort((nodeA, nodeB) => sortNodePositions(nodeA.position, nodeB.position));
		const nodeIdSet = new Set(nodes.map((node) => node.id));

		graphNodes.forEach(({ id: nodeId, dimensions: { width, height } }) => {
			graph.setNode(nodeId, { width, height });
		});

		edges
			.filter((edge) => nodeIdSet.has(edge.source) && nodeIdSet.has(edge.target))
			.forEach((edge) => graph.setEdge(edge.source, edge.target));

		return graph;
	}

	function createDagreSubGraph({
		nodeIds,
		parent,
	}: { nodeIds: string[]; parent: dagre.graphlib.Graph }) {
		const subGraph = new dagre.graphlib.Graph();
		subGraph.setGraph({
			rankdir: 'LR',
			edgesep: NODE_Y_SPACING,
			nodesep: NODE_Y_SPACING,
			ranksep: NODE_X_SPACING,
		});
		subGraph.setDefaultEdgeLabel(() => ({}));
		const nodeIdSet = new Set(nodeIds);

		parent
			.nodes()
			.filter((nodeId) => nodeIdSet.has(nodeId))
			.forEach((nodeId) => {
				subGraph.setNode(nodeId, parent.node(nodeId));
			});

		parent
			.edges()
			.filter((edge) => nodeIdSet.has(edge.v) && nodeIdSet.has(edge.w))
			.forEach((edge) => subGraph.setEdge(edge.v, edge.w, parent.edge(edge)));

		return subGraph;
	}

	function createDagreVerticalGraph({ nodes }: { nodes: Array<{ id: string; box: BoundingBox }> }) {
		const subGraph = new dagre.graphlib.Graph();
		subGraph.setGraph({
			rankdir: 'TB',
			align: 'UL',
			edgesep: SUBGRAPH_SPACING,
			nodesep: SUBGRAPH_SPACING,
			ranksep: SUBGRAPH_SPACING,
		});
		subGraph.setDefaultEdgeLabel(() => ({}));

		nodes.forEach(({ id, box: { width, height } }) => subGraph.setNode(id, { width, height }));

		nodes.forEach((node, index) => {
			if (!nodes[index + 1]) return;
			subGraph.setEdge(node.id, nodes[index + 1].id);
		});

		return subGraph;
	}

	function createAiSubGraph({
		parent,
		nodeIds,
	}: { parent: dagre.graphlib.Graph; nodeIds: string[] }) {
		const subGraph = new dagre.graphlib.Graph();
		subGraph.setGraph({
			rankdir: 'TB',
			edgesep: AI_X_SPACING,
			nodesep: AI_X_SPACING,
			ranksep: AI_Y_SPACING,
		});
		subGraph.setDefaultEdgeLabel(() => ({}));
		const nodeIdSet = new Set(nodeIds);

		parent
			.nodes()
			.filter((nodeId) => nodeIdSet.has(nodeId))
			.forEach((nodeId) => {
				subGraph.setNode(nodeId, parent.node(nodeId));
			});

		parent
			.edges()
			.filter((edge) => nodeIdSet.has(edge.v) && nodeIdSet.has(edge.w))
			.forEach((edge) => subGraph.setEdge(edge.w, edge.v));

		return subGraph;
	}

	function compositeBoundingBox(boxes: BoundingBox[]): BoundingBox {
		const { minX, minY, maxX, maxY } = boxes.reduce(
			(bbox, node) => {
				const { x, y, width, height } = node;
				return {
					minX: Math.min(bbox.minX, x),
					maxX: Math.max(bbox.maxX, x + width),
					minY: Math.min(bbox.minY, y),
					maxY: Math.max(bbox.maxY, y + height),
				};
			},
			{ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
		);

		return {
			x: minX,
			y: minY,
			width: maxX - minX,
			height: maxY - minY,
		};
	}

	function boundingBoxFromCanvasNode(node: GraphNode<CanvasNodeData>): BoundingBox {
		return {
			x: node.position.x,
			y: node.position.y,
			width: node.dimensions.width,
			height: node.dimensions.height,
		};
	}

	function boundingBoxFromDagreNode(node: dagre.Node): BoundingBox {
		return {
			x: node.x - node.width / 2,
			y: node.y - node.height / 2,
			width: node.width,
			height: node.height,
		};
	}

	function boundingBoxFromGraph(graph: dagre.graphlib.Graph): BoundingBox {
		return compositeBoundingBox(
			graph.nodes().map((nodeId) => boundingBoxFromDagreNode(graph.node(nodeId))),
		);
	}

	function boundingBoxFromCanvasNodes(nodes: Array<GraphNode<CanvasNodeData>>): BoundingBox {
		return compositeBoundingBox(nodes.map(boundingBoxFromCanvasNode));
	}

	function isCoveredBy(parent: BoundingBox, child: BoundingBox) {
		const childRight = child.x + child.width;
		const childBottom = child.y + child.height;
		const parentRight = parent.x + parent.width;
		const parentBottom = parent.y + parent.height;

		return (
			child.x >= parent.x &&
			child.y >= parent.y &&
			childRight <= parentRight &&
			childBottom <= parentBottom
		);
	}

	function centerHorizontally(container: BoundingBox, target: BoundingBox) {
		const containerCenter = container.x + container.width / 2;
		const newX = containerCenter - target.width / 2;
		return newX;
	}

	function intersects(container: BoundingBox, target: BoundingBox, padding = 0): boolean {
		// Add padding to target box dimensions
		const targetWithPadding = {
			x: target.x - padding,
			y: target.y - padding,
			width: target.width + padding * 2,
			height: target.height + padding * 2,
		};

		const noIntersection =
			targetWithPadding.x + targetWithPadding.width < container.x ||
			targetWithPadding.x > container.x + container.width ||
			targetWithPadding.y + targetWithPadding.height < container.y ||
			targetWithPadding.y > container.y + container.height;

		return !noIntersection;
	}

	function isAiParentNode(node: CanvasNodeData) {
		return (
			node.render.type === CanvasNodeRenderType.Default &&
			node.render.options.configurable &&
			!node.render.options.configuration
		);
	}

	function isAiConfigNode(node: CanvasNodeData) {
		return node.render.type === CanvasNodeRenderType.Default && node.render.options.configuration;
	}

	function getAllConnectedAiConfigNodes({
		graph,
		root,
		nodeById,
	}: {
		graph: dagre.graphlib.Graph;
		root: CanvasNodeData;
		nodeById: CanvasNodeDictionary;
	}): string[] {
		return (graph.predecessors(root.id) as unknown as string[])
			.map((successor) => nodeById[successor])
			.filter((node) => isAiConfigNode(node.data))
			.flatMap((node) => [
				node.id,
				...getAllConnectedAiConfigNodes({ graph, root: node.data, nodeById }),
			]);
	}

	function snapToGrid(num: number) {
		return Math.floor(num / GRID_SIZE) * GRID_SIZE;
	}

	function layout(target: CanvasLayoutTarget): LayoutResult {
		const { nodes, edges } = getTargetData(target);

		const nonStickyNodes = nodes
			.filter((node) => node.data.type !== STICKY_NODE_TYPE)
			.map((node) => findNode(node.id))
			.filter(isPresent);
		const boundingBoxBefore = boundingBoxFromCanvasNodes(nonStickyNodes);

		const parentGraph = createDagreGraph({ nodes: nonStickyNodes, edges });
		const nodeById = nonStickyNodes.reduce((acc, node) => {
			acc[node.id] = node;
			return acc;
		}, {} as CanvasNodeDictionary);

		// Divide workflow in to subgraphs
		// A subgraph contains a group of connected nodes that is not connected to any node outside of this group
		const subgraphs = dagre.graphlib.alg.components(parentGraph).map((nodeIds) => {
			const subgraph = createDagreSubGraph({ nodeIds, parent: parentGraph });
			const aiParentNodes = subgraph
				.nodes()
				.map((nodeId) => nodeById[nodeId].data)
				.filter(isAiParentNode);

			const aiGraphs = aiParentNodes.map((aiParentNode) => {
				const configNodeIds = getAllConnectedAiConfigNodes({
					graph: subgraph,
					nodeById,
					root: aiParentNode,
				});
				const allAiNodeIds = configNodeIds.concat(aiParentNode.id);
				const aiGraph = createAiSubGraph({
					parent: subgraph,
					nodeIds: allAiNodeIds,
				});
				configNodeIds.forEach((nodeId) => subgraph.removeNode(nodeId));
				const rootEdges = subgraph
					.edges()
					.filter((edge) => edge.v === aiParentNode.id || edge.w === aiParentNode.id);

				dagre.layout(aiGraph);
				const aiBoundingBox = boundingBoxFromGraph(aiGraph);
				subgraph.setNode(aiParentNode.id, {
					width: aiBoundingBox.width,
					height: aiBoundingBox.height,
				});
				rootEdges.forEach((edge) => subgraph.setEdge(edge));

				return { graph: aiGraph, boundingBox: aiBoundingBox, aiParentNode };
			});

			dagre.layout(subgraph);

			return { graph: subgraph, aiGraphs, boundingBox: boundingBoxFromGraph(subgraph) };
		});

		const compositeGraph = createDagreVerticalGraph({
			nodes: subgraphs.map(({ boundingBox }, index) => ({
				box: boundingBox,
				id: index.toString(),
			})),
		});

		dagre.layout(compositeGraph);

		const boundingBoxByNodeId = subgraphs
			.flatMap(({ graph, aiGraphs }, index) => {
				const subgraphPosition = compositeGraph.node(index.toString());

				const aiParentNodes = new Set(aiGraphs.map(({ aiParentNode }) => aiParentNode.id));
				const offset = {
					x: 0,
					y: subgraphPosition.y - subgraphPosition.height / 2,
				};

				return graph.nodes().flatMap((nodeId) => {
					const { x, y, width, height } = graph.node(nodeId);
					const positionedNode = {
						id: nodeId,
						boundingBox: {
							x: x + offset.x - width / 2,
							y: y + offset.y - height / 2,
							width,
							height,
						},
					};

					if (aiParentNodes.has(nodeId)) {
						const aiGraph = aiGraphs.find(({ aiParentNode }) => aiParentNode.id === nodeId);

						if (!aiGraph) return [];

						const aiParentNodeBox = positionedNode.boundingBox;

						const parentOffset = {
							x: aiParentNodeBox.x,
							y: aiParentNodeBox.y,
						};

						return aiGraph.graph.nodes().map((aiNodeId) => {
							const aiNode = aiGraph.graph.node(aiNodeId);
							const aiBoundingBox = {
								x: aiNode.x + parentOffset.x - aiNode.width / 2,
								y: aiNode.y + parentOffset.y - aiNode.height / 2,
								width: aiNode.width,
								height: aiNode.height,
							};

							return {
								id: aiNodeId,
								boundingBox: aiBoundingBox,
							};
						});
					}

					return positionedNode;
				});
			})
			.reduce(
				(acc, node) => {
					acc[node.id] = node.boundingBox;
					return acc;
				},
				{} as Record<string, BoundingBox>,
			);

		// Adjust AI node vertical position
		subgraphs
			.flatMap(({ aiGraphs }) => aiGraphs)
			.forEach(({ graph }) => {
				const aiNodes = graph.nodes();
				const aiGraphBoundingBox = compositeBoundingBox(
					aiNodes.map((nodeId) => boundingBoxByNodeId[nodeId]).filter(isPresent),
				);
				const aiNodeVerticalCorrection = aiGraphBoundingBox.height / 2 - NODE_SIZE / 2;
				aiGraphBoundingBox.y += aiNodeVerticalCorrection;

				const hasConflictingNodes = Object.entries(boundingBoxByNodeId)
					.filter(([id]) => !graph.hasNode(id))
					.some(([, nodeBoundingBox]) =>
						intersects(aiGraphBoundingBox, nodeBoundingBox, NODE_Y_SPACING),
					);

				if (!hasConflictingNodes) {
					for (const aiNode of aiNodes) {
						boundingBoxByNodeId[aiNode].y += aiNodeVerticalCorrection;
					}
				}
			});

		const positionedNodes = Object.entries(boundingBoxByNodeId).map(([id, boundingBox]) => ({
			id,
			boundingBox,
		}));
		const boundingBoxAfter = compositeBoundingBox(positionedNodes.map((node) => node.boundingBox));

		const anchor = {
			x: boundingBoxAfter.x - boundingBoxBefore.x,
			y: boundingBoxAfter.y - boundingBoxBefore.y,
		};

		const stickies = nodes
			.filter((node) => node.data.type === STICKY_NODE_TYPE)
			.map((node) => findNode(node.id))
			.filter(isPresent);

		const positionedStickies = stickies
			.map((sticky) => {
				const stickyBox = boundingBoxFromCanvasNode(sticky);
				const coveredNodes = nonStickyNodes.filter((node) =>
					isCoveredBy(boundingBoxFromCanvasNode(sticky), boundingBoxFromCanvasNode(node)),
				);

				if (coveredNodes.length === 0) return null;

				const coveredNodesBoxAfter = compositeBoundingBox(
					positionedNodes
						.filter((node) => coveredNodes.some((covered) => covered.id === node.id))
						.map(({ boundingBox }) => boundingBox),
				);
				return {
					id: sticky.id,
					boundingBox: {
						x: centerHorizontally(coveredNodesBoxAfter, stickyBox),
						y:
							coveredNodesBoxAfter.y +
							coveredNodesBoxAfter.height -
							stickyBox.height +
							STICKY_BOTTOM_PADDING,
						height: stickyBox.height,
						width: stickyBox.width,
					},
				};
			})
			.filter(isPresent);

		return {
			boundingBox: boundingBoxAfter,
			nodes: positionedNodes.concat(positionedStickies).map(({ id, boundingBox }) => {
				return {
					id,
					x: snapToGrid(boundingBox.x - anchor.x),
					y: snapToGrid(boundingBox.y - anchor.y),
				};
			}),
		};
	}

	return { layout };
}
