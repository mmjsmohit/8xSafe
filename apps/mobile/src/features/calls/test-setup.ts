import Module from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as reactNativeMock from "./react-native-test-mock";

const reactNativeMockPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "react-native-test-mock.ts"
);

require.cache[reactNativeMockPath] = {
  exports: reactNativeMock,
  filename: reactNativeMockPath,
  id: reactNativeMockPath,
  loaded: true,
  children: [],
  isPreloading: false,
  parent: undefined,
  path: path.dirname(reactNativeMockPath),
  paths: []
} as unknown as NodeJS.Module;

type ModuleWithResolveFilename = typeof Module & {
  _resolveFilename: (
    request: string,
    parent: NodeJS.Module | undefined,
    isMain: boolean,
    options?: unknown
  ) => string;
};

const moduleWithResolve = Module as ModuleWithResolveFilename;
const resolveFilename = moduleWithResolve._resolveFilename.bind(moduleWithResolve);

moduleWithResolve._resolveFilename = function patchedResolve(
  request: string,
  parent: NodeJS.Module | undefined,
  isMain: boolean,
  options?: unknown
): string {
  if (request === "react-native") {
    return reactNativeMockPath;
  }
  return resolveFilename(request, parent, isMain, options);
};
