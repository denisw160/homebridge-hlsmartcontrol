import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  CharacteristicEventTypes,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  HAPStatus,
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

  private readonly api: API;
  private readonly log: Logging;

  private readonly name: string;
  private readonly debug: boolean;
  private readonly color: boolean;
  private readonly timeout: number;
  private readonly host: string;
  private readonly port: number;

  private readonly switchService: Service;
  private readonly informationService: Service;

  // Cached state
  private state = {
    lock: false,
    lastResolveTimeMills: 0,
    on: false,
    white: 0,
    blue: 0,
    green: 0,
    red: 0,
    h: 0,
    s: 0,
    l: 0,
  };

  /**
   * Create the plugin instance and initialize settings.
   * @param log Logging from Homebridge
   * @param config configuration of the plugin
   * @param api API from Homebridge
   */
  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.api = api;
    this.name = config.name;
    this.debug = config.debug || false;
    this.color = config.color || false;
    this.timeout = config.timeout || 1000;
    this.host = config.host;
    this.port = config.port || 80;

    if (this.color) {
      log.debug('Enable Lightbulb');
      this.switchService = new hap.Service.Lightbulb(this.name);
    } else {
      log.debug('Enable Switch');
      this.switchService = new hap.Service.Switch(this.name);
    }

    // Default actions for switch (on/off)
    this.switchService.getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
        this.getOn(callback);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        const v = value as boolean;
        this.setOn(v, callback);
      });

    // Add additional actions for color handling
    if (this.color) {
      this.switchService.addCharacteristic(new hap.Characteristic.Brightness())
        .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
          this.getBrightness(callback);
        })
        .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
          const v = value as number;
          this.setBrightness(v, callback);
        });

      this.switchService.addCharacteristic(new hap.Characteristic.Hue())
        .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
          this.getHue(callback);
        })
        .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
          const v = value as number;
          this.setHue(v, callback);
        });

      this.switchService.addCharacteristic(new hap.Characteristic.Saturation())
        .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
          this.getSaturation(callback);
        })
        .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
          const v = value as number;
          this.setSaturation(v, callback);
        });
    }

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
    this.log.info('Identify: ', this.name);
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

  private getOn(callback: CharacteristicGetCallback): void {
    this.resolveLightState().then(() => {
      this.log.debug('getOn => ' + this.state.on);
      callback(HAPStatus.SUCCESS, this.state.on);
    }).catch(() => {
      callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    });
  }

  private setOn(value: boolean, callback: CharacteristicSetCallback): void {
    if (value) {
      const on = [100, 100, 100, 100];
      this.log.debug('setOn => ' + on);
      this.switchToManual(on, callback);
    } else {
      const off = [0, 0, 0, 0];
      this.switchToManual(off, callback);
    }
  }

  private getBrightness(callback: CharacteristicGetCallback): void {
    this.resolveLightState().then(() => {
      const hsl = this.getLightHsl();
      this.log.debug('getBrightness => ' + hsl[2]);
      callback(HAPStatus.SUCCESS, hsl[2]);
    }).catch(() => {
      callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    });
  }

  private setBrightness(value: number, callback: CharacteristicSetCallback): void {
    this.resolveLightState().then(() => {
      this.state.l = value; // use cached values
      const rgb = this.convertToRgb([this.state.h, this.state.s, this.state.l]);
      this.state.white = 0; // use only colored LEDs
      this.state.red = rgb[0];
      this.state.green = rgb[1];
      this.state.blue = rgb[2];

      const brightness = [this.state.white, this.state.blue, this.state.green, this.state.red];
      this.log.info('setBrightness => ', brightness);
      this.switchToManual(brightness, callback);
    }).catch(() => {
      callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    });
  }

  private getHue(callback: CharacteristicGetCallback): void {
    this.resolveLightState().then(() => {
      const hsl = this.getLightHsl();
      this.log.debug('getHue => ' + hsl[0]);
      callback(HAPStatus.SUCCESS, hsl[0]);
    }).catch(() => {
      callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    });
  }

  private setHue(value: number, callback: CharacteristicSetCallback): void {
    this.resolveLightState().then(() => {
      this.state.h = value; // use cached values
      const rgb = this.convertToRgb([this.state.h, this.state.s, this.state.l]);
      this.state.white = 0; // use only colored LEDs
      this.state.red = rgb[0];
      this.state.green = rgb[1];
      this.state.blue = rgb[2];

      const hue = [this.state.white, this.state.blue, this.state.green, this.state.red];
      this.log.info('setHue => ', hue);
      this.switchToManual(hue, callback);
    }).catch(() => {
      callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    });
  }

  private getSaturation(callback: CharacteristicGetCallback): void {
    this.resolveLightState().then(() => {
      const hsl = this.getLightHsl();
      this.log.debug('getSaturation => ' + hsl[1]);
      callback(HAPStatus.SUCCESS, hsl[1]);
    }).catch(() => {
      callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    });
  }

  private setSaturation(value: number, callback: CharacteristicSetCallback): void {
    this.resolveLightState().then(() => {
      this.state.s = value; // use cached values
      const rgb = this.convertToRgb([this.state.h, this.state.s, this.state.l]);
      this.state.white = 0; // use only colored LEDs
      this.state.red = rgb[0];
      this.state.green = rgb[1];
      this.state.blue = rgb[2];

      const saturation = [this.state.white, this.state.blue, this.state.green, this.state.red];
      this.log.info('setSaturation => ' + saturation);
      this.switchToManual(saturation, callback);
    }).catch(() => {
      callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    });
  }

  /**
   * Query the light status from SmartControl.
   * @returns a promise with the state object of the lamp
   */
  private resolveLightState(): Promise<void> {
    return new Promise<void>((resolve, reject) => {

      // Avoid to many resolve queries
      if (Date.now() - this.state.lastResolveTimeMills < this.minResolveTimeMills || this.state.lock) {
        this.log.info('Last/cached state of the light was: ' + (this.state.on ? 'ON' : 'OFF'));
        resolve();
        return;
      }

      // Lock oject
      this.log.debug('Locking...');
      this.state.lock = true;

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
              if (responseData.C.ch.length === 4) {
                this.state.white = responseData.C.ch[0];
                this.state.blue = responseData.C.ch[1];
                this.state.green = responseData.C.ch[2];
                this.state.red = responseData.C.ch[3];
              } else {
                this.state.white = 0;
                this.state.blue = 0;
                this.state.green = 0;
                this.state.red = 0;
              }

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
              const aBrightness = brightness.split(',');
              if (aBrightness.length === 4) {
                this.state.white = Number(aBrightness[0]);
                this.state.blue = Number(aBrightness[1]);
                this.state.green = Number(aBrightness[2]);
                this.state.red = Number(aBrightness[3]);
              } else {
                this.state.white = 0;
                this.state.blue = 0;
                this.state.green = 0;
                this.state.red = 0;
              }
            }
          } catch (e) {
            this.log.error('Unable to calculate light state: ' + e);
            this.state.lastResolveTimeMills = 0;
            this.state.on = false;
            reject(e);
          }

          // Update light state
          this.state.on = this.getLight() > 0;

          // Inform Homebridge
          this.state.lastResolveTimeMills = Date.now();
          this.log.info('Returned state of the light is: ' + (this.state.on ? 'ON' : 'OFF'));
          this.log.debug('Light state is ', this.state);

          resolve();
        })
        .catch((error) => {
          // handle error
          this.log.error('Error during query for light state: ' + error);
          this.state.lastResolveTimeMills = 0;
          this.state.on = false;
          reject(error);
        })
        .finally(() => {
          // Unlocking oject
          this.log.debug('Unlocking!');
          this.state.lock = false;
        });
    });
  }

  /**
   * Switch the light state to manual mode. The SmartControl is turn in manual mode for 1h.
   * The the color of the HeliaLux SmartControl is set to the values.
   * Special settings all values are 100% (on) or 0% (off).
   * @param values Values for the light (white, blue, green, red)
   * @param callback if success, call this callback and inform Homebridge
   */
  private switchToManual(values: Array<number>, callback: CharacteristicSetCallback): void {
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

        this.log.info('Turning light to ', values);
        this.setLight(values, callback);
      })
      .catch((error) => {
        // handle error
        this.log.error('Error during switch to manual mode: ' + error);
        callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      });
  }

  /**
   * Turn the color to given values.
   * @param values Values for the light (white, blue, green, red)
   * @param callback if success, call this callback and inform Homebridge
   */
  private setLight(values: Array<number>, callback: CharacteristicSetCallback): void {
    const url = 'http://' + this.host + ':' + this.port + '/color';
    const requestData = 'action=1' + HLSmartControlSwitch.getLightChannels(values);
    this.logRequest('setLight', requestData, url);
    axios.default.post(url, requestData, {
      timeout: this.timeout,
      headers: HLSmartControlSwitch.getRequestHeaders(),
    })
      .then((response) => {
        // handle success
        const responseData = response.data;
        const responseStatus = response.status;
        this.logResponse('setLight', responseData, responseStatus);

        // Update state and inform Homebridge
        if (values.length === 4) {
          this.state.white = values[0];
          this.state.blue = values[1];
          this.state.green = values[2];
          this.state.red = values[3];
          this.state.on = this.getLight() > 0;
        }
        this.state.lastResolveTimeMills = 0;
        this.log.info('Switch light state was set to: ' + (this.state.on ? 'ON' : 'OFF'));
        callback(HAPStatus.SUCCESS);
      })
      .catch((error) => {
        // handle error
        this.log.error('Error during turn on lights: ' + error);
        callback(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
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
   * Get the light as sum of colors.
   * @returns Sum of colors
   */
  private getLight(): number {
    return this.state.white + this.state.blue + this.state.green + this.state.red;
  }

  /**
   * Converts the RGB color value (from light state) to HSL.
   * Assumes colors red, green and blue are in [0..100] and
   * returns hue in [0..360] and saturation and level in [0..100].
   * @returns The HSL representation
   */
  private getLightHsl(): [number, number, number] {
    const r = this.state.red / 100;
    const g = this.state.green / 100;
    const b = this.state.blue / 100;
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    const delta = max - min;
    let h;
    let s;

    if (max === min) {
      h = 0;
    } else if (r === max) {
      h = (g - b) / delta;
    } else if (g === max) {
      h = 2 + (b - r) / delta;
    } else if (b === max) {
      h = 4 + (r - g) / delta;
    }

    h = Math.min(h * 60, 360);

    if (h < 0) {
      h += 360;
    }

    const l = (min + max) / 2;

    if (max === min) {
      s = 0;
    } else if (l <= 0.5) {
      s = delta / (max + min);
    } else {
      s = delta / (2 - max - min);
    }

    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
  }

  /**
   * Converts the HSL color value to RGB.
   * Assumes colors red, green and blue are in [0..100] and
   * returns hue in [0..360] and saturation and level in [0..100].
   * @param hsl The HSL representation
   * @returns The RGB representation
   */
  private convertToRgb(hsl: [number, number, number]): [number, number, number] {
    const h = hsl[0] / 360;
    const s = hsl[1] / 100;
    const l = hsl[2] / 100;
    let t2;
    let t3;
    let val;

    if (s === 0) {
      val = Math.round(l * 100);
      return [val, val, val];
    }

    if (l < 0.5) {
      t2 = l * (1 + s);
    } else {
      t2 = l + s - l * s;
    }

    const t1 = 2 * l - t2;

    const rgb: [number, number, number] = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      t3 = h + 1 / 3 * -(i - 1);
      if (t3 < 0) {
        t3++;
      }

      if (t3 > 1) {
        t3--;
      }

      if (6 * t3 < 1) {
        val = t1 + (t2 - t1) * 6 * t3;
      } else if (2 * t3 < 1) {
        val = t2;
      } else if (3 * t3 < 2) {
        val = t1 + (t2 - t1) * (2 / 3 - t3) * 6;
      } else {
        val = t1;
      }

      rgb[i] = val * 255;
    }

    rgb[0] = Math.round(rgb[0] / 255 * 100);
    rgb[1] = Math.round(rgb[1] / 255 * 100);
    rgb[2] = Math.round(rgb[2] / 255 * 100);

    return rgb;
  }

  /**
   * Return the values to a channel string (for the request).
   * Example: '&ch1=100&ch2=100&ch3=100&ch4=100'
   * @param values Values for the light (white, blue, green, red)
   */
  private static getLightChannels(values: Array<number>): string {
    if (!values || values.length !== 4) {
      return '&ch1=0&ch2=0&ch3=0&ch4=0';
    } else {
      let channels = '';
      values.forEach((value, index) => {
        channels += '&ch' + (index + 1) + '=' + value;
      });
      return channels;
    }
  }

  /**
   * Formats a log message.
   * @param message message
   */
  private static formatMessage(message: string): string {
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
  private static isString(value): boolean {
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
