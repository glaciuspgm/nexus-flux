'use strict';

var _createClass = require('babel-runtime/helpers/create-class')['default'];

var _classCallCheck = require('babel-runtime/helpers/class-call-check')['default'];

var _inherits = require('babel-runtime/helpers/inherits')['default'];

var _get = require('babel-runtime/helpers/get')['default'];

var _Object$defineProperty = require('babel-runtime/core-js/object/define-property')['default'];

var _Object$assign = require('babel-runtime/core-js/object/assign')['default'];

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

_Object$defineProperty(exports, '__esModule', {
  value: true
});

var _remutable = require('remutable');

var _remutable2 = _interopRequireDefault(_remutable);

var _lifespan = require('lifespan');

var _lifespan2 = _interopRequireDefault(_lifespan);

var _nexusEvents = require('nexus-events');

// we just need this reference for typechecks

var _ClientEvent = require('./Client.Event');

var _ClientEvent2 = _interopRequireDefault(_ClientEvent);

var _ServerEvent = require('./Server.Event');

var _ = require('lodash');
var should = require('should');
var Promise = (global || window).Promise = require('bluebird');
var __DEV__ = process.env.NODE_ENV !== 'production';
var __PROD__ = !__DEV__;
var __BROWSER__ = typeof window === 'object';
var __NODE__ = !__BROWSER__;
if (__DEV__) {
  Promise.longStackTraces();
  Error.stackTraceLimit = Infinity;
}

var _Server = undefined;

// abstract

var Link = (function () {
  function Link() {
    var _this = this;

    _classCallCheck(this, Link);

    if (__DEV__) {
      // ensure abstracts
      this.constructor.should.not.be.exactly(Link);
      // ensure virtual
      this.sendToClient.should.not.be.exactly(Link.prototype.sendToClient);
    }
    this.lifespan = new _lifespan2['default']();
    // will be set by the server; should be called when received client events, to forward them to the server
    this.receiveFromClient = null;
    this.lifespan.onRelease(function () {
      _this.receiveFromClient = null;
    });
  }

  _createClass(Link, [{
    key: 'sendToClient',

    // virtual
    // should forward the event to the associated client
    value: function sendToClient(ev) {
      if (__DEV__) {
        ev.should.be.an.instanceOf(_Server.Event);
      }
      throw new TypeError('Virtual method invocation');
    }
  }, {
    key: 'acceptFromServer',

    // will be called by the server
    value: function acceptFromServer(receiveFromClient) {
      if (__DEV__) {
        receiveFromClient.should.be.a.Function;
      }
      this.receiveFromClient = receiveFromClient;
    }
  }, {
    key: 'receiveFromServer',

    // will be called by server
    value: function receiveFromServer(ev) {
      if (__DEV__) {
        ev.should.be.an.instanceOf(_Server.Event);
      }
      this.sendToClient(ev);
    }
  }]);

  return Link;
})();

var Server = (function (_EventEmitter) {
  function Server() {
    var _this2 = this;

    _classCallCheck(this, Server);

    _get(Object.getPrototypeOf(Server.prototype), 'constructor', this).call(this);
    this.lifespan = new _lifespan2['default']();
    this._links = {};
    this._subscriptions = {};
    this.lifespan.onRelease(function () {
      _.each(_this2._links, function (_ref, linkID) {
        var link = _ref.link;
        var subscriptions = _ref.subscriptions;

        _.each(subscriptions, function (path) {
          return _this2.unsubscribe(linkID, path);
        });
        link.lifespan.release();
      });
      _this2._links = null;
      _this2._subscriptions = null;
    });
  }

  _inherits(Server, _EventEmitter);

  _createClass(Server, [{
    key: 'dispatchAction',
    value: function dispatchAction(path, params) {
      var _this3 = this;

      return Promise['try'](function () {
        if (__DEV__) {
          path.should.be.a.String;
          params.should.be.an.Object;
        }
        _this3.emit('action', { path: path, params: params });
      });
    }
  }, {
    key: 'dispatchUpdate',
    value: function dispatchUpdate(path, patch) {
      var _this4 = this;

      if (__DEV__) {
        path.should.be.a.String;
        patch.should.be.an.instanceOf(_remutable2['default'].Patch);
      }
      if (this._subscriptions[path] !== void 0) {
        (function () {
          var ev = new Server.Event.Update({ path: path, patch: patch });
          _.each(_this4._subscriptions[path], function (link) {
            link.receiveFromServer(ev);
          });
        })();
      }
      return this;
    }
  }, {
    key: 'subscribe',
    value: function subscribe(linkID, path) {
      if (__DEV__) {
        linkID.should.be.a.String;
        path.should.be.a.String;
        this._links.should.have.property(linkID);
      }
      if (this._subscriptions[path] === void 0) {
        this._subscriptions[path] = {};
      }
      this._subscriptions[path][linkID] = this._links[linkID].link;
      if (this._links[linkID].subscriptions[path] === void 0) {
        this._links[linkID].subscriptions[path] = path;
      }
      return this;
    }
  }, {
    key: 'unsubscribe',
    value: function unsubscribe(linkID, path) {
      if (__DEV__) {
        linkID.should.be.a.String;
        path.should.be.a.String;
        this._links.should.have.property(linkID);
        this._links[linkID].subscriptions.should.have.property(path);
        this._subscriptions.should.have.property(path);
        this._subscriptions[path].should.have.property(linkID);
      }
      delete this._links[linkID].subscriptions[path];
      delete this._subscriptions[path][linkID];
      if (_.size(this._subscriptions[path]) === 0) {
        delete this._subscriptions[path];
      }
    }
  }, {
    key: 'acceptLink',
    value: function acceptLink(link) {
      var _this5 = this;

      if (__DEV__) {
        link.should.be.an.instanceOf(Link);
      }

      var linkID = _.uniqueId();
      this._links[linkID] = {
        link: link,
        subscriptions: {} };
      link.acceptFromServer(function (ev) {
        return _this5.receiveFromLink(linkID, ev);
      });
      link.lifespan.onRelease(function () {
        _.each(_this5._links[linkID].subscriptions, function (path) {
          return _this5.unsubscribe(linkID, path);
        });
        delete _this5._links[linkID];
      });
    }
  }, {
    key: 'receiveFromLink',
    value: function receiveFromLink(linkID, ev) {
      if (__DEV__) {
        linkID.should.be.a.String;
        this._links.should.have.property(linkID);
        ev.should.be.an.instanceOf(_ClientEvent2['default'].Event);
      }
      if (ev instanceof _ClientEvent2['default'].Event.Subscribe) {
        return this.subscribe(linkID, ev.path);
      }
      if (ev instanceof _ClientEvent2['default'].Event.Unsubscribe) {
        return this.unsubscribe(linkID, ev.path);
      }
      if (ev instanceof _ClientEvent2['default'].Event.Action) {
        return this.dispatchAction(ev.path, ev.params);
      }
      if (__DEV__) {
        throw new TypeError('Unknown Client.Event: ' + ev);
      }
    }
  }]);

  return Server;
})(_nexusEvents.EventEmitter);

_Server = Server;

_Object$assign(Server, { Event: _ServerEvent.Event, Link: Link });

exports['default'] = Server;
module.exports = exports['default'];