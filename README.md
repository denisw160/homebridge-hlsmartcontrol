# Homebridge Plugin for Juwel HeliaLux SmartControl

[![Version][version-image]][version-url]
[![Downloads][downloads-image]][downloads-url]
[![License][license-image]][license-url]
[![Build][build-image]][build-url]

A homebridge plugin for Juwel HeliaLux SmartControl (https://www.juwel-aquarium.de/).

This plugin is also published on npm like regular plugins, so you can easily run them in your
local homebridge instance. Install it as usual.

The plugin is written in Typescript and require at least homebridge v1.4.0. It is a fork of the
[homebridge example accessory](https://github.com/homebridge/homebridge-examples/tree/master/accessory-example-typescript).
To build the plugin run the following commands in the main plugin directory (this directory). The template for
a Homebridge plugin can found in this [repo](https://github.com/homebridge/homebridge-plugin-template).

Run this command once to install all dependencies required by the plugin:

    npm install

After that run the following command to compile the Typescript files into Javascript (repeat this step every time
you change something in the code).

    npm run build

## Add the plugin to your Homebridge config

Add a new accessory to your Homebridge configuration. The plug has the following options:

    "accessories": [
        {
          "accessory": "HLSmartControl",
          "name": "HeliaLux SmartControl",
          "debug": false,
          "color": false,
          "timeout": 1000,
          "host": "xxx.xxx.xxx.xxx",
          "port": 80
        }
      ],

### Options

- name (string, required): Name of the plugin show in your Homekit
- debug (boolean, default: false): Enable additional logging information
- color (boolean, default: false): Enable color selection for the lamp (since version 1.2.0)
- timeout (int, default: 1000): Set the timeout (im ms) for the http request
- host (string, required): IP-address or hostname of the SmartControl device
- port (int, default: 80): Port on the SmartControl device

## Link to your Homebridge (for developing)

Run this command that Homebridge can discover the plugin in your development environment:

    npm run link

You can now start developing Homebridge instance with this command:

    npm run homebridge

Make sure that your Homebridge configuration exists in your home (`~/.homebridge/config.json`). You found a sample
under `test/homebridge/config.json`.

## Watch for changes and build automatically

If you want to have your code compile automatically as you make changes, and restart Homebridge automatically
between changes you can run:

    npm run watch

This will launch an instance of Homebridge in debug mode which will restart every time you make a change to
the source code. It will the config stored in the default location under `~/.homebridge`. You may need to stop
other running instances of Homebridge while using this command to prevent conflicts. You can adjust the
Homebridge startup command in the `nodemon.json` file.

<!-- Version -->

[version-image]: https://img.shields.io/npm/v/homebridge-hlsmartcontrol.svg?style=flat
[version-url]: https://www.npmjs.com/package/homebridge-hlsmartcontrol

<!-- Downloads -->

[downloads-image]: https://img.shields.io/npm/dm/homebridge-hlsmartcontrol.svg?style=flat
[downloads-url]: https://npmcharts.com/compare/homebridge-hlsmartcontrol?minimal=true

<!-- License -->

[license-image]: https://img.shields.io/badge/license-ISC-blue.svg?style=flat
[license-url]: LICENSE

<!-- Build -->

[build-image]: https://github.com/denisw160/homebridge-hlsmartcontrol/workflows/Build%20and%20Lint/badge.svg
[build-url]: https://github.com/denisw160/homebridge-hlsmartcontrol
