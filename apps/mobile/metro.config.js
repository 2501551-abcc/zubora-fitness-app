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

module.exports = config;
