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

/*
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

/*
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
        log.info('Current state of the switch was returned: ' + (this.switchOn ? 'ON' : 'OFF'));
        callback(undefined, this.switchOn);
      })
      .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
        this.switchOn = value as boolean;
        log.info('Switch state was set to: ' + (this.switchOn ? 'ON' : 'OFF'));
        callback();
      });

    this.informationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Juwel')
      .setCharacteristic(hap.Characteristic.Model, 'HeliaLux SmartControl v2');

    log.info('HeliaLux SmartControl finished initializing!');
  }

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log.info('Identify: {}', this.name);
  }

  /*
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
  getServices(): Service[] {
    return [
      this.informationService,
      this.switchService,
    ];
  }

  // getLightState(): void {
  //
  // }

  // setLightState(value: boolean): void {
  //
  // }

}
