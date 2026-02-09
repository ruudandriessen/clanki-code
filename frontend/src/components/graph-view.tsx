import { useCallback, useMemo } from "react";
import { ReactFlow, Background, Controls, MarkerType, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useNavigate } from "@tanstack/react-router";
import { GroupNode } from "./group-node";
import type { GraphData } from "../lib/api";
import { groupColor } from "../lib/group-colors";

const nodeTypes = { group: GroupNode };

export function GraphView({ data, projectId }: { data: GraphData; projectId: string }) {
  const navigate = useNavigate();

  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of data.groups) {
      map[g.name] = groupColor(g.color);
    }
    return map;
  }, [data]);

  const fileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of data.classifications) {
      counts[c.group] = (counts[c.group] ?? 0) + 1;
    }
    return counts;
  }, [data]);

  const nodes: Node[] = useMemo(() => {
    const count = data.groups.length;
    const centerX = 500;
    const centerY = 400;
    const radius = 350;

    return data.groups.map((g, i) => {
      const angle = (2 * Math.PI * i) / count - Math.PI / 2;
      return {
        id: g.name,
        type: "group",
        position: {
          x: centerX + radius * Math.cos(angle) - 90,
          y: centerY + radius * Math.sin(angle) - 50,
        },
        data: {
          label: g.name,
          fileCount: fileCounts[g.name] ?? 0,
          color: colorMap[g.name] ?? groupColor(null),
          description: g.description,
        },
        style: { background: "transparent", padding: 0, border: "none", boxShadow: "none" },
      };
    });
  }, [data, fileCounts, colorMap]);

  const edges: Edge[] = useMemo(
    () =>
      data.groupEdges.map((e) => ({
        id: `${e.from}->${e.to}`,
        source: e.from,
        target: e.to,
        label: `${e.weight} edges · ${e.symbols.length} symbols`,
        labelStyle: { fill: "#a1a1aa", fontWeight: 500, fontSize: 11 },
        labelBgStyle: { fill: "#141414" },
        labelBgPadding: [8, 4] as [number, number],
        labelBgBorderRadius: 4,
        style: {
          stroke: colorMap[e.from] ?? groupColor(null),
          strokeWidth: Math.max(1.5, Math.min(e.weight, 6)),
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: colorMap[e.from] ?? groupColor(null),
        },
        animated: true,
      })),
    [data, colorMap],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      navigate({
        to: "/projects/$projectId/groups/$name",
        params: { projectId, name: node.id },
      });
    },
    [navigate, projectId],
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
