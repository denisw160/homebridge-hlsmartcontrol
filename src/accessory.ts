import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
} from 'homebridge';
import axios = require('axios');

/**
 *
 * Homebridge Plugin for HeliaLux SmartControl
 *
 * A homebridge plugin for Juwel HeliaLux SmartControl (https://www.juwel-aquarium.de/).
 * This plugin add the HeliaLux as a switch to the homebridge. The switch show the status of the lamp.
 * Is the lamp on, if the light / rgb values are greater than 0. Otherwise the switch is off.
 * If the lamp is off, you can turn the lights. The values for light and rgb are set to 100%. This state
 * is enabled for 1h (service mode), than the lamp return to the programmed profile.
 *
 */
let hap: HAP;

/**
 * Initializer function called when the plugin is loaded.
 */
export = (api: API) => {
  hap = api.hap;
  api.registerAccessory('HLSmartControl', HLSmartControlSwitch);
};

class HLSmartControlSwitch implements AccessoryPlugin {

  private readonly api: API;
  private readonly log: Logging;

  private readonly name: string;
  private readonly debug: boolean;
  private readonly timeout: number;
  private readonly host: string;
  private readonly port: number;

  private switchOn = false;

  private readonly switchService: Service;
  private readonly informationService: Service;

  /**
   * Create the plugin instance and initialize settings.
   * @param log Logging from Homebridge
   * @param config configuration of the pluginx
   * @param api API from Homebridge
   */
  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.api = api;
    this.name = config.name;
    this.debug = config.debug || false;
    this.timeout = config.timeout || 1000;
    this.host = config.host;
    this.port = config.port || 80;

    this.switchService = new hap.Service.Switch(this.name);
    this.switchService.getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        this.resolveLightState(callback);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        const v = value as boolean;
        this.switchLightState(v, callback);
      });

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Juwel')
      .setCharacteristic(hap.Characteristic.Model, 'HeliaLux SmartControl v2');

    log.info('HeliaLux SmartControl finished initializing!');
  }

  /**
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log.info('Identify: {}', this.name);
  }

  /**
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
  getServices(): Service[] {
    return [
      this.informationService,
      this.switchService,
    ];
  }

  /**
   * Query the light status from SmartControl.
   * @param callback if success, call this callback and inform Homebridge
   */
  private resolveLightState(callback: CharacteristicGetCallback): void {
    // Query status of the light
    const url = 'http://' + this.host + ':' + this.port + '/stat';
    axios.default.post(url, 'action=10', {
      timeout: this.timeout,
      headers: {
        'Content-type': 'application/x-www-form-urlencoded',
      },
    })
      .then((response) => {
        // handle success
        const data = response.data;
        this.logResponse('resolveLightState', data);

        // Calculate light state
        let light = 0;
        try {
          if (data instanceof Object) {
            data.C.ch.forEach((i) => {
              light += i;
            });
          }
        } catch (e) {
          this.log.error('Unable to calculate light state: ' + e);
        }

        // Update light state
        this.switchOn = light > 0;

        // Inform Homebridge
        this.log.info('Current state of the light was returned: ' + (this.switchOn ? 'ON' : 'OFF'));
        callback(undefined, this.switchOn);
      })
      .catch((error) => {
        // handle error
        this.log.error('Error during query for light state: ' + error);
      });
  }

  /**
   * Switch the light state. The SmartControl is turn in manual mode for 1h.
   * The the color of the HeliaLux SmartControl is set 100% (on) or to 0% (off).
   * @param value State for the light.
   * @param callback if success, call this callback and inform Homebridge
   */
  private switchLightState(value: boolean, callback: CharacteristicSetCallback): void {
    const url = 'http://' + this.host + ':' + this.port + '/stat';
    axios.default.post(url, 'action=14&cswi=true&ctime=01:00', {
      timeout: this.timeout,
      headers: {
        'Content-type': 'application/x-www-form-urlencoded',
      },
    })
      .then((response) => {
        // handle success
        const data = response.data;
        this.logResponse('turnOnManualControl', data);

        if (this.switchOn) {
          this.log.info('Turning light off');
          // this.turnOnManualControl(this.turnOffLight.bind(this), callback);
          this.turnOffLight(callback);
        } else {
          this.log.info('Turning light on');
          // this.turnOnManualControl(this.turnOnLight.bind(this), callback);
          this.turnOnLight(callback);
        }
      })
      .catch((error) => {
        // handle error
        this.log.error('Error during turn on manual mode: ' + error);
      });
  }

  /**
   * Turn the color to 100%.
   * @param callback if success, call this callback and inform Homebridge
   */
  private turnOnLight(callback: CharacteristicSetCallback): void {
    const url = 'http://' + this.host + ':' + this.port + '/color';
    axios.default.post(url, 'action=1&ch1=100&ch2=100&ch3=100&ch4=100', {
      timeout: this.timeout,
      headers: {
        'Content-type': 'application/x-www-form-urlencoded',
      },
    })
      .then((response) => {
        // handle success
        const data = response.data;
        this.logResponse('turnOnLight', data);

        // Update state and inform Homebridge
        this.switchOn = true;
        this.log.info('Switch light state was set to: ' + (this.switchOn ? 'ON' : 'OFF'));
        callback();
      })
      .catch((error) => {
        // handle error
        this.log.error('Error during turn on lights: ' + error);
      });
  }

  /**
   * Turn the color to 0%.
   * @param callback if success, call this callback and inform Homebridge
   */
  private turnOffLight(callback: CharacteristicSetCallback): void {
    const url = 'http://' + this.host + ':' + this.port + '/color';
    axios.default.post(url, 'action=1&ch1=0&ch2=0&ch3=0&ch4=0', {
      timeout: this.timeout,
      headers: {
        'Content-type': 'application/x-www-form-urlencoded',
      },
    })
      .then((response) => {
        // handle success
        const data = response.data;
        this.logResponse('turnOffLight', data);

        // Update state and inform Homebridge
        this.switchOn = true;
        this.log.info('Switch light state was set to: ' + (this.switchOn ? 'ON' : 'OFF'));
        callback();
      })
      .catch((error) => {
        // handle error
        this.log.error('Error during turn off lights: ' + error);
      });
  }

  /**
   * Log received response from the server.
   * @param name name for the request
   * @param data data in response
   */
  private logResponse(name: string, data) {
    if (this.debug) {
      this.log.info('************ ' + name + ' start request *****************************');
      if (data instanceof Object) {
        this.log.info('data: ' + JSON.stringify(data));
      } else {
        this.log.info('data: ' + data);
      }
      this.log.info('************ ' + name + ' end request *******************************');
    }
  }

}
