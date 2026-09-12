const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// フォーム判定ロジック（PoseFormEvaluator / exerciseConfig）は
// apps/mobile の外側、cv/pose に置かれている（cv担当者の管理下）。
// Metroはデフォルトでは projectRoot の外を解決できないため、
// cv フォルダを watchFolders に加えて明示的に許可する。
const repoRoot = path.resolve(projectRoot, '../..');
const cvRoot = path.resolve(repoRoot, 'cv');

config.watchFolders = [...(config.watchFolders ?? []), cvRoot];

// watchFoldersはファイルを「見つける」ことしか解決しない。
// cv/pose 側のファイル（apps/mobile の外）から expo-speech のような
// パッケージをimportすると、Metroは通常「ファイルのある場所から上の階層」
// にしかnode_modulesを探しに行かないため、apps/mobile/node_modules（兄弟フォルダ）
// を見つけられずに Unable to resolve module エラーになる。
// nodeModulesPaths に明示的に追加し、常にここも探索対象にする。
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(projectRoot, 'node_modules'),
];

module.exports = config;
