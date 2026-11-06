// Keep the review server (and its node_modules) out of the phone app bundle.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const server = path.resolve(__dirname, 'server').replace(/[/\\]/g, '[/\\\\]');
config.resolver.blockList = [new RegExp(`^${server}[/\\\\].*$`)];
module.exports = config;
