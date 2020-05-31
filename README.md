# homebridge-hlsmartcontrol

![Build and Lint](https://github.com/denisw160/homebridge-hlsmartcontrol/workflows/Build%20and%20Lint/badge.svg)

A homebridge plugin for Juwel HeliaLux SmartControl (https://www.juwel-aquarium.de/).

This plugin is also published on npm like regular plugins, so you can easily run them in your 
local homebridge instance. Install it as usual.

The plugin is written in Typescript and require at least homebridge v1.0.0. It is a fork of the 
[homebridge example accessory](https://github.com/homebridge/homebridge-examples/tree/master/accessory-example-typescript).
To build the plugin run the following commands in the main plugin directory (this directory). The template for
a Homebridge plugin can found in this [repo](https://github.com/homebridge/homebridge-plugin-template).

Run this command once to install all dependencies required by the plugin:

    npm install

After that run the following command to compile the Typescript files into Javascript (repeat this step every time 
you change something in the code).

    npm run build
