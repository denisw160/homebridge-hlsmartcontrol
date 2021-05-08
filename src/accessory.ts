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
 * A Homebridge plugin for Juwel HeliaLux SmartControl (https://www.juwel-aquarium.de/).
 * This plugin add the HeliaLux as a switch to the Homebridge. The switch show the status of the lamp.
 * Is the lamp on, if the light / rgb values are greater than 0. Otherwise the switch is off.
 * If the lamp is off, you can turn the lights. The values for light and rgb are set to 100%. This state
 * is enabled for 1h (service mode), than the lamp return to the programmed profile.
 *
 */
let hap: HAP;

/**
 * Initializer function called when the plugin is loaded.
 */
export = (api: API): void => {
  hap = api.hap;
  api.registerAccessory('HLSmartControl', HLSmartControlSwitch);
};

// noinspection HttpUrlsUsage
class HLSmartControlSwitch implements AccessoryPlugin {

  private readonly minResolveTimeMills = 5000;

  private readonly turnLightOnChannels = '&ch1=100&ch2=100&ch3=100&ch4=100';
  private readonly turnLightOffChannels = '&ch1=0&ch2=0&ch3=0&ch4=0';

  private readonly api: API;
  private readonly log: Logging;

  private readonly name: string;
  private readonly debug: boolean;
  private readonly timeout: number;
  private readonly host: string;
  private readonly port: number;

  private switchOn = false;
  private lastResolveTimeMills = 0;

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
        this.switchToManual(v, callback);
      });

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Juwel')
      .setCharacteristic(hap.Characteristic.Model, 'HeliaLux SmartControl v2.1.0');

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
    // Avoid to many resolve queries
    if (Date.now() - this.lastResolveTimeMills < this.minResolveTimeMills) {
      this.log.info('Last state of the light was: ' + (this.switchOn ? 'ON' : 'OFF'));
      callback(undefined, this.switchOn);
      return;
    }

    // Query status of the light
    // Alternative implementation for query via /color
    // const url = 'http://' + this.host + ':' + this.port + '/color';
    // const requestData = 'action=10';
    // this.logRequest('resolveLightState', null, url);
    // axios.default.post(url, requestData, {
    // Use status variables from UI
    const url = 'http://' + this.host + ':' + this.port + '/statusvars.js';
    this.logRequest('resolveLightState', null, url);
    axios.default.get(url, {
      timeout: this.timeout,
      headers: HLSmartControlSwitch.getRequestHeaders(),
    })
      .then((response) => {
        // handle success
        const responseData = response.data;
        const responseStatus = response.status;
        this.logResponse('resolveLightState', responseData, responseStatus);

        // Calculate light state
        let light = 0;
        try {
          if (responseData instanceof Object) {
            /* Response is a JSON object (/color)
             *     {
             *         "A": {
             *             "action": "10"
             *         },
             *         "C": {
             *             "no": 4,
             *             "ch": [
             *                 0,
             *                 0,
             *                 0,
             *                 0
             *             ]
             *         }
             *     }
             */
            responseData.C.ch.forEach((i) => {
              light += i;
            });
          } else if (HLSmartControlSwitch.isString(responseData)
            && responseData.includes(';') && responseData.includes('=')) {
            /* Response is a string with variables
             *   lang=0;lamp='4Ch';profNum=4;profile='Dunkler';tsimtime=817;tsimact=0;csimact=1;
             *   brightness=[100,100,100,100];times=[0,900,930,1275,1290,1320,1439];CH1=[0,0,100,100,30,0,0];
             *   CH2=[0,0,90,90,15,0,0];CH3=[0,0,100,100,15,0,0];CH4=[0,0,100,100,40,0,0];
             */
            const keyValues = responseData.split(';');
            let brightness = '[0,0,0,0]';
            keyValues.forEach((element) => {
              if (element.startsWith('brightness=')) {
                brightness = element.split('=')[1];
              }
            });
            brightness = brightness.replace('[', '').replace(']', '');
            brightness.split(',').forEach((element) => {
              light += Number(element);
            });
          }
        } catch (e) {
          this.log.error('Unable to calculate light state: ' + e);
        }

        // Update light state
        this.switchOn = light > 0;

        // Inform Homebridge
        this.lastResolveTimeMills = Date.now();
        this.log.info('Returned state of the light is: ' + (this.switchOn ? 'ON' : 'OFF'));
        callback(undefined, this.switchOn);
      })
      .catch((error) => {
        // handle error
        this.log.error('Error during query for light state: ' + error);
      });
  }

  /**
   * Switch the light state to manual mode. The SmartControl is turn in manual mode for 1h.
   * The the color of the HeliaLux SmartControl is set 100% (on) or to 0% (off).
   * @param value State for the light.
   * @param callback if success, call this callback and inform Homebridge
   */
  private switchToManual(value: boolean, callback: CharacteristicSetCallback): void {
    const url = 'http://' + this.host + ':' + this.port + '/stat';
    const requestData = 'action=14&cswi=true&ctime=01:00';
    this.logRequest('switchToManual', requestData, url);
    axios.default.post(url, requestData, {
      timeout: this.timeout,
      headers: HLSmartControlSwitch.getRequestHeaders(),
    })
      .then((response) => {
        // handle success
        const responseData = response.data;
        const responseStatus = response.status;
        this.logResponse('switchToManual', responseData, responseStatus);

        if (this.switchOn) {
          this.log.info('Turning light off');
          this.turnOffLight(callback);
        } else {
          this.log.info('Turning light on');
          this.turnOnLight(callback);
        }
      })
      .catch((error) => {
        // handle error
        this.log.error('Error during switch to manual mode: ' + error);
      });
  }

  /**
   * Turn the color to 100%.
   * @param callback if success, call this callback and inform Homebridge
   */
  private turnOnLight(callback: CharacteristicSetCallback): void {
    const url = 'http://' + this.host + ':' + this.port + '/color';
    const requestData = 'action=1' + this.turnLightOnChannels;
    this.logRequest('turnOnLight', requestData, url);
    axios.default.post(url, requestData, {
      timeout: this.timeout,
      headers: HLSmartControlSwitch.getRequestHeaders(),
    })
      .then((response) => {
        // handle success
        const responseData = response.data;
        const responseStatus = response.status;
        this.logResponse('turnOnLight', responseData, responseStatus);

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
    const requestData = 'action=1' + this.turnLightOffChannels;
    this.logRequest('turnOffLight', requestData, url);
    axios.default.post(url, requestData, {
      timeout: this.timeout,
      headers: HLSmartControlSwitch.getRequestHeaders(),
    })
      .then((response) => {
        // handle success
        const responseData = response.data;
        const responseStatus = response.status;
        this.logResponse('turnOffLight', responseData, responseStatus);

        // Update state and inform Homebridge
        this.switchOn = false;
        this.log.info('Switch light state was set to: ' + (this.switchOn ? 'ON' : 'OFF'));
        callback();
      })
      .catch((error) => {
        // handle error
        this.log.error('Error during turn off lights: ' + error);
      });
  }

  /**
   * Log send request to the server.
   * @param name name for the request
   * @param data data in request
   * @param url url for the request
   */
  private logRequest(name: string, data, url: string) {
    if (this.debug) {
      this.log.info(HLSmartControlSwitch.formatMessage(name + ' request url: ' + url));
    }
    this.logData(name, data, 'request');
  }

  /**
   * Log received response from the server.
   * @param name name for the response
   * @param data data in response
   * @param status status code of the response
   */
  private logResponse(name: string, data, status: number) {
    if (this.debug) {
      this.log.info(HLSmartControlSwitch.formatMessage(name + ' response status: ' + status));
    }
    this.logData(name, data, 'response');
  }

  /**
   * Log the data.
   * @param name name
   * @param data data
   * @param type type
   */
  private logData(name: string, data, type: string) {
    if (this.debug && data !== null) {
      this.log.info(HLSmartControlSwitch.formatMessage(name + ' start ' + type));
      this.log.info('type ' + typeof data);
      if (data instanceof Object) {
        this.log.info('data: ' + JSON.stringify(data));
      } else {
        this.log.info('data: ' + data);
      }
      this.log.info(HLSmartControlSwitch.formatMessage(name + ' end ' + type));
    }
  }

  /**
   * Formats a log message.
   * @param message message
   */
  private static formatMessage(message: string) {
    if (message === null) {
      return '';
    }
    const m = '***** ' + message + ' ';
    return m.padEnd(80, '*');
  }

  /**
   * Check if value is a string.
   * @param value value
   */
  private static isString(value) {
    return value !== null && typeof value === 'string';
  }

  /**
   * Build the request header.
   */
  private static getRequestHeaders() {
    return {
      'User-Agent': 'Homebridge',
      'Accept': '*/*',
      'Content-type': 'application/x-www-form-urlencoded',
    };
  }

}
