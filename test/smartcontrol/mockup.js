const http = require('http');
const qs = require('querystring');

module.exports = SmartControlMockup;

/**
 * Create new constructor for the mockup.
 * @constructor
 */
function SmartControlMockup() {
  this.port = 8888;
  this.manual = false;
  this.color = 0;
}

/**
 * Start the server.
 */
SmartControlMockup.prototype.start = function () {
  http.createServer(this.handleRequest.bind(this)).listen(this.port);
  console.log('SmartControl Mockup listening on ' + this.port + '...');
};

/**
 * Handle the incoming requests from the clients.
 * @param request Request
 * @param response Response
 */
SmartControlMockup.prototype.handleRequest = function (request, response) {
  if (request.method !== 'POST') {
    response.writeHead(405, {'Content-Type': 'text/html'});
    response.write('Method Not Allowed');
    response.end();

    console.log('Someone tried to access the server without a POST request');
    return;
  }

  // Handle requests
  const that = this;
  let body = '';

  request.on('data', function (data) {
    body += data;
  });

  function writeStateResponse() {
    response.writeHead(200, {'Content-Type': 'application/json'});
    let result = {
      'A': {
        'action': '10',
      },
      'S': {
        'dtime': '14:10',
        'stime': 850,
        'tswi': '',
        'cswi': that.manual,
        'ttime': '01:00',
        'ctime': '01:00',
      },
      'C': {
        'no': 4,
        'ch': [
          that.color,
          that.color,
          that.color,
          that.color,
        ],
      },
    };
    response.write(JSON.stringify(result));
    response.end();
  }

  function writeColorResponse() {
    response.writeHead(200, {'Content-Type': 'application/json'});
    let result = {
      'A': {
        'action': '01',
      },
      'C': {
        'no': 4,
        'ch': [
          that.color,
          that.color,
          that.color,
          that.color,
        ],
      },
    };
    response.write(JSON.stringify(result));
    response.end();
  }

  request.on('end', function () {
    // Parse the request body
    let data = qs.parse(body);

    // Handle actions and returns
    if (request.url === '/stat' && data.action === '10') {
      console.log('Query for light state - manual: ' + that.manual + ' / color: ' + that.color);
      writeStateResponse();

    } else if (request.url === '/stat' && data.action === '14' && data.cswi !== undefined && data.ctime !== undefined) {
      that.manual = data.cswi;
      console.log('Updating light state - manual: ' + that.manual + ' / color: ' + that.color);
      writeStateResponse();

    } else if (request.url === '/color' && data.action === '1' && data.ch1 !== undefined && data.ch2 !== undefined && data.ch3 !== undefined && data.ch4 !== undefined) {
      that.color = data.ch1;
      console.log('Updating light color - manual: ' + that.manual + ' / color: ' + that.color);
      writeColorResponse();

    } else {
      // Invalid request
      response.writeHead(405, {'Content-Type': 'text/html'});
      response.write('Invalid request');
      response.end();

      console.log('Someone tried to access the server with an invalid POST request');
    }
  });
};

// Start the Mockup
const mockup = new SmartControlMockup();
mockup.start();
