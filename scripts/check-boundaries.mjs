import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve('src');
const errors = [];
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(resolve(dir, e.name))
      : /\.[jt]sx?$/.test(e.name)
        ? [resolve(dir, e.name)]
        : [],
  );
}
for (const file of walk(root)) {
  const source = relative(root, file).replaceAll('\\', '/');
  const [layer, feature] = source.split('/');
  const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  function visit(node) {
    let specifier;
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      specifier = node.moduleSpecifier.text;
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    )
      specifier = node.arguments[0].text;
    if (specifier) {
      if (specifier.startsWith('@plabs-wallet/') && !source.startsWith('services/wallet/'))
        errors.push(`${source}: SDK imports must stay in services/wallet`);
      const target = specifier.startsWith('@/')
        ? specifier.slice(2)
        : specifier.startsWith('.')
          ? relative(root, resolve(dirname(file), specifier)).replaceAll('\\', '/')
          : null;
      if (target) {
        const [targetLayer, targetFeature] = target.split('/');
        if (layer === 'shared' && targetLayer !== 'shared')
          errors.push(`${source}: shared cannot import ${target}`);
        if (layer === 'services' && !['services', 'shared'].includes(targetLayer))
          errors.push(`${source}: services cannot import ${target}`);
        if (layer === 'features' && targetLayer === 'app')
          errors.push(`${source}: a feature cannot import app`);
        if (
          layer === 'features' &&
          targetLayer === 'features' &&
          targetFeature !== feature &&
          targetFeature !== 'wallet'
        )
          errors.push(`${source}: cross-feature dependency on ${target}`);
        if (
          ['features', 'services'].includes(targetLayer) &&
          (layer !== targetLayer || feature !== targetFeature) &&
          target.split('/').length > 2
        )
          errors.push(
            `${source}: import the public entry point of ${targetLayer}/${targetFeature}`,
          );
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'fetch' &&
      source !== 'shared/api/http-client.ts' &&
      !source.endsWith('.test.ts')
    )
      errors.push(`${source}: HTTP transport belongs in shared/api/http-client.ts`);
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
if (errors.length) {
  for (const error of errors) process.stderr.write(`${error}\n`);
  process.exitCode = 1;
} else process.stdout.write('Architecture boundaries passed.\n');
