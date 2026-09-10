const { withXcodeProject, withDangerousMod, IOSConfig } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MODEL_FILENAME = 'pose_landmarker_full.task';

// モデル本体は cv/pose（cv担当者の管理フォルダ）に置かれている。
// apps/mobile 側に複製を持たず、prebuild時にそこから直接コピーする。
const MODEL_SOURCE_DIR = ['..', '..', 'cv', 'pose'];

// react-native-mediapipe looks up the model with Bundle.main.path(forResource:ofType:),
// which requires the file to be added to the app target's "Copy Bundle Resources"
// build phase. `expo prebuild` regenerates ios/ from scratch and has no built-in way
// to know about this file, so we copy it in and register it ourselves.
const withPoseModel = (config) => {
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const src = path.join(config.modRequest.projectRoot, ...MODEL_SOURCE_DIR, MODEL_FILENAME);
      const destDir = path.join(config.modRequest.platformProjectRoot, config.modRequest.projectName);
      const dest = path.join(destDir, MODEL_FILENAME);
      fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(src, dest);
      return config;
    },
  ]);

  config = withXcodeProject(config, (config) => {
    const projectName = config.modRequest.projectName;
    const filepath = `${projectName}/${MODEL_FILENAME}`;
    if (!config.modResults.hasFile(filepath)) {
      config.modResults = IOSConfig.XcodeUtils.addResourceFileToGroup({
        filepath,
        groupName: projectName,
        project: config.modResults,
        isBuildFile: true,
        verbose: true,
      });
    }
    return config;
  });

  return config;
};

module.exports = withPoseModel;
