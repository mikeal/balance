var sys = require("sys"),
    http = require("http"),
    url = require("url"),
    pool = require("./pool"),
    events = require("events");

binaryContentTypes = ['application/octet-stream', 'application/ogg', 'application/zip', 'application/pdf',
                      'image/gif', 'image/jpeg', 'image/png', 'image/tiff', 'image/vnd.microsoft.icon',
                      'multipart/encrypted', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
                      'application/msword', 'application/x-dvi', 'application/x-shockwave-flash', 
                      'application/x-stuffit', 'application/x-rar-compressed', 'application/x-tar']

var guessEncoding = function (contentEncoding, contentType) {
  var encoding = "utf8";
  if (contentEncoding === undefined && contentType === undefined) {
    return "binary"
  }
  if (contentEncoding == 'gzip') {
    encoding = "binary";
  } else if (contentType) {
    if (contentType.indexOf('charset=') !== -1) {
      encoding = contentType.split('charset=')[1];
      if (encoding.toLowerCase() === 'utf-8') { return 'utf8'; }
      if (encoding.toLowerCase() === 'ascii') { return 'ascii'; }
      return "binary"
    } else if (contentType.slice(0,6) == 'video/' || contentType.slice(0,6) == 'audio/') {
      encoding = "binary";
    } else if (binaryContentTypes.indexOf(contentType) != -1) {
      encoding = "binary";
    }
  }
  return encoding;
}

function Balancer () {
  this.pool = pool.createPool();
}
sys.inherits(Balancer, events.EventEmitter);

Balancer.prototype.getRequestHandler = function (clientRequest, clientResponse) {
  var self = this;

  return function (clientRequest, clientResponse) {  
    var route = {};
    clientRequest.setRoute = function (port, hostname) {
      route.port = port; 
      route.hostname = hostname;
    }
    clientRequest.getResponse = function () {route.finished = true; return clientResponse;}
    self.emit("route", clientRequest)
    if (route.finished) {return;}
    if (!route.port || !route.hostname) {
      sys.puts("Request was not routed.")
      clientResponse.writeHead(503, "503 Service Unavailable", {
        "content-type":"text/plain",
        "content-length":"503 Service Unavailable".length,
      })
      clientResponse.write("503 Service Unavailable", "ascii");
      clientResponse.end();
      return;
    }
    
    
    var c = self.pool.getGroup(route.port, route.hostname).getClient();
    var clientError = function (error) {
      clientResponse.writeHead(504, "504 Gateway Timeout", {
        "content-type":"text/plain",
        "content-length":"504 Gateway Timeout".length,
      })
      clientResponse.write("504 Gateway Timeout", "ascii");
      clientResponse.end();
      c.removeListener("error", clientError);
      c.group.removeClient(c);
    }
    c.addListener("error", clientError)
    
    var proxyRequest = c.request(clientRequest.method, clientRequest.url, clientRequest.headers);
    proxyRequest.addListener("response", function (response) {
      c.removeListener("error", clientError);
      response.csize = 0;
      self.emit("response", clientRequest, response);
      clientRequest.emit("response", response);
      clientResponse.writeHeader(response.statusCode, response.headers);
      if (clientRequest.method == "HEAD") {
        clientResponse.end();
        c.group.removeClient(c);
        return;
      }
      var encoding = guessEncoding(response.headers['content-encoding'], response.headers['content-type']);
      response.setBodyEncoding(encoding)
      
      response.addListener("data", function (chunk) {
        response.csize += chunk.length;
        clientResponse.write(chunk, encoding);
      })
      var nError = function () {
        clientResponse.end();
        c.removeListener("error", nError)
      }
      response.addListener("end", function () {
        clientResponse.end();
        c.removeListener("error", nError);
      })
      // work-around for end event bug in node
      // if (clientRequest.method == 'HEAD') {
      //   response.emit("end");
      //   c.group.removeClient(c);
      // }
    })

    var encoding = guessEncoding(clientRequest.headers['content-encoding'], clientRequest.headers['content-type']);
    clientRequest.addListener("data", function (chunk) {
      proxyRequest.write(chunk, encoding);
    })
    clientRequest.addListener("end", function () {
      proxyRequest.end();
    })
  }
}
Balancer.prototype.getServer = function () {
  var self = this;
  return http.createServer(self.getRequestHandler());
}

exports.Balancer = Balancer;
