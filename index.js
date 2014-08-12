/************************************************************************
* Copyright 2014 Colin Bookman                                          *
* Liscensed under the GPLv3.                                            *
* Please contact me if you require a different liscense                 *
*                                                                       *
* This program is free software: you can redistribute it and/or modify  *
* it under the terms of the GNU General Public License as published by  *
* the Free Software Foundation, either version 3 of the License, or     *
* (at your option) any later version.                                   *
*                                                                       *
* This program is distributed in the hope that it will be useful,       *
* but WITHOUT ANY WARRANTY; without even the implied warranty of        *
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the         *
* GNU General Public License for more details.                          *
*                                                                       *
* You should have received a copy of the GNU General Public License     *
* along with this program.  If not, see <http://www.gnu.org/licenses/>. *
*************************************************************************/
var auth = require('./auth');
var request = require('request');
var parseXML = require('xml2js').parseString;
function ShittyDB(config, callback) {
  var that = this;
  this.login(config, function then() {
    console.log("Logged In");
    callback();
  });
}

/*
  @params dbkey type string
  Select a database
  Example: ShittyDB.use('1nm3BvaOcnx1cAmSLgnsAbug0eDhhkNnin9el0tuUaIs')
*/
ShittyDB.prototype.use = function(dbKey) {
  this.dbKey = dbKey;
  console.log("Database changed: "  + 'https://spreadsheets.google.com/feeds/list/'+this.dbKey+'/od6/private/full');
  return this;
};

/*
  @params config type object
  @params callback type function
  Logs you into google
  config must contain a username and password @ root level.
*/
ShittyDB.prototype.login = function(config, callback) {
  var that = this;
  auth(config, function(err, token) {
    if(err) return callback(err);
    console.log('Logged into Google');
    that.loginKey = token;
    that.authHeaders = that.httpHeaders(token);
    callback(null); //no errors
  });
};
/*
  @params token type object
  Returns and Sets http headers needed for google authentication
*/
ShittyDB.prototype.httpHeaders = function(token) {
  if (this.loginKey.type == 'GoogleLogin') {
    this.loginKey.token = 'auth='+this.loginKey.token;
  }
  this.authHeaders = {
    'Authorization': this.loginKey.type + ' ' + this.loginKey.token,
    'Content-Type': 'application/atom+xml',
    'GData-Version': '3.0',
    'If-Match': '*'
  };
  return this.authHeaders;
};
/*
  @params params type object - request syntax (https://github.com/mikeal/request)
  @params callback type function
  Calls a google spreadsheets restful API
*/
ShittyDB.prototype.request = function(params, callback) {
  if (!params || !params.url)
    return callback("Invalid request", null);
  if (!this.authHeaders)
    return callback("No authorization token. Use auth() first.", null);

  params.headers = this.authHeaders;

  if(!params.method)
    params.method = 'GET';

  var that = this;
  request(params, function(err, response, body) {
    //show error
    if(err)
      return callback(err, null);
    //missing the response???
    if(!response)
      return callback('no response', null);

    //reauth
    if(response.statusCode === 401 && typeof that.loginKey.token !== 'object') {
      that.log('Authentication token expired. Logging into Google again...'.grey);
      return auth(params, function(err, token) {
        if(err) return callback(err);
        that.setToken(token);
        that.request(opts, callback);
      });
    }

    //body is error
    if(response.statusCode !== 200)
      return callback(body);
    //we always request xml, parse it
    parseXML(body, function(err, xml) {
      if (xml && !err) {
        callback(null,    xml);
      } else if(err) {
        callback(err,      null);
      } else {
        callback("ERROR!", null);
      }
    });
  });
};
/*

*/
ShittyDB.prototype.sanetizeTableData = function(xml) {
  var results = xml.feed.entry;
  var res = [];
  for(var i = 0, l = results.length; i < l; ++i) {
    var result = {};
    for(var key in results[i]) {
      if(key.indexOf('gsx:') > -1) {
        var data = results[i][key];
        data = (data.length == 1 && data instanceof Array) ? data[0] : data;
        result[key.replace('gsx:','')] = data;
      }
    }
    res.push(result);
  }
  return res;
};

/*
  @params query type string
  queries the database
  e.g: query = {
    orderBy: 'firstName',
    reverseOrder: 'true',
    selector: 'salary > 100000 and salary < 200000'
  }
*/
ShittyDB.prototype.query = function(query, callback) {
  var url = 'https://spreadsheets.google.com/feeds/list/1nm3BvaOcnx1cAmSLgnsAbug0eDhhkNnin9el0tuUaIs/od6/private/full?';
  if(query.orderBy) {
    url += 'orderby=' + query.orderBy + '&';
    if(query.reverseOrder) {
      url += 'reverse=true&';
    }
  }
  if(query.selector) {
    url +='sq=' + query.selector.replace(/\s/g,'');
  }
  var that = this;
  this.request({url: url}, function(err, xml) {
    if(err) {
      callback(err, null);
    } else {
      xml = that.sanetizeTableData(xml);
      callback(null, xml);
    }
  });
};

/*
  Returns all results from the currently selected table
*/
ShittyDB.prototype.fetchAll = function(callback) {
  this.query({}, callback);
};

/*
  Returns a list of all 'tables' from selected database
*/
ShittyDB.prototype.listTables = function(callback) {
  try {
    var url = 'https://spreadsheets.google.com/feeds/spreadsheets/private/full';
    this.request({url: url}, function(err, xml) {
      var tables = {};
      var entries = xml.feed.entry;
      for(var i = 0, l = xml.feed.entry.length; i < l; ++i) {
        tables[entries[i].title] = (entries[i].id.length === 1) ? entries[i].id[0] : entries[i].id;
      }
      return callback(err, tables);
    });
  } catch(err) {
    return callback(err, null);
  }
};

module.exports = ShittyDB;
