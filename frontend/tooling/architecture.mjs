import path from "node:path";
const levels = { atoms: 0, molecules: 1, organisms: 2, templates: 3 };
export default {
  rules: {
    layers: {
      meta: {
        type: "problem",
        schema: [],
        messages: {
          boundary:
            "{{source}} cannot import {{target}}. Compose lower layers and inject data/callbacks from pages.",
        },
      },
      create(context) {
        const filename = path.resolve(context.filename).replaceAll("\\", "/");
        const layer = filename.match(
          /\/src\/components\/(atoms|molecules|organisms|templates)\//,
        )?.[1];
        if (!layer) return {};
        function check(node, value) {
          if (typeof value !== "string" || !value.startsWith(".")) return;
          const target = path.resolve(path.dirname(context.filename), value).replaceAll("\\", "/");
          const targetLayer = target.match(
            /\/src\/components\/(atoms|molecules|organisms|templates)\//,
          )?.[1];
          if (
            (targetLayer && levels[targetLayer] > levels[layer]) ||
            /\/src\/(pages|hooks|services)\//.test(target)
          )
            context.report({
              node,
              messageId: "boundary",
              data: { source: layer, target: targetLayer ?? target.split("/src/")[1] },
            });
        }
        return {
          ImportDeclaration(node) {
            check(node, node.source.value);
          },
          ExportNamedDeclaration(node) {
            if (node.source) check(node, node.source.value);
          },
          ExportAllDeclaration(node) {
            check(node, node.source.value);
          },
          ImportExpression(node) {
            check(node, node.source.value);
          },
        };
      },
    },
  },
};
