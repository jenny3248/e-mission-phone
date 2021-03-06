angular.module('emission.splash.pushnotify', ['ionic.cloud', 'emission.plugin.logger',
                                              'emission.services',
                                              'emission.splash.startprefs',
                                              'angularLocalStorage'])
.factory('PushNotify', function($window, $state, $rootScope, $ionicPush, $ionicPlatform,        $ionicPopup, storage, Logger, CommHelper, StartPrefs) {

    var pushnotify = {};
    var push = null;

    pushnotify.startupInit = function() {
      var push = $window.PushNotification.init({
        "ios": {
          "badge": true,
          "sound": true,
          "vibration": true,
          "clearBadge": true
        },
        "android": {
          "senderID": "97387382925",
          "iconColor": "#343434",
          "clearNotifications": true
        }
      });
    }

    pushnotify.registerPush = function() {
      $ionicPush.register().then(function(t) {
         // alert("Token = "+JSON.stringify(t));
         Logger.log("Token = "+JSON.stringify(t));
         return $window.cordova.plugins.BEMServerSync.getConfig().then(function(config) {
            return config.sync_interval;
         }, function(error) {
            console.log("Got error "+error+" while reading config, returning default = 3600");
            return 3600;
         }).then(function(sync_interval) {
             CommHelper.updateUser({
                device_token: t.token,
                curr_platform: ionic.Platform.platform(),
                curr_sync_interval: sync_interval
             });
             return t;
         }).then(function(t) {
            // TODO: Figure out if we need this if we are going to invoke manually with tokens...
            return $ionicPush.saveToken(t);
         });
      }).then(function(t) {
         // alert("Finished saving token = "+JSON.stringify(t.token));
         Logger.log("Finished saving token = "+JSON.stringify(t.token));
      }).catch(function(error) {
         $ionicPopup.alert({template: JSON.stringify(error)});
      });
    }

    var redirectSilentPush = function(event, data) {
        Logger.log("Found silent push notification, for platform "+ionic.Platform.platform());
        if (!$ionicPlatform.is('ios')) {
          Logger.log("Platform is not ios, handleSilentPush is not implemented or needed");
          // doesn't matter if we finish or not because platforms other than ios don't care
          return;
        }
        Logger.log("Platform is ios, calling handleSilentPush on DataCollection");
        var notId = data.message.payload.notId;

        pushnotify.datacollect.getConfig().then(function(config) {
          if(config.ios_use_remote_push_for_sync) {
            pushnotify.datacollect.handleSilentPush()
            .then(function() {
               Logger.log("silent push finished successfully, calling push.finish");
               showDebugLocalNotification("silent push finished, calling push.finish"); 
               $ionicPush.plugin.finish(function(){}, function(){}, notId);
            })
          } else {
            Logger.log("Using background fetch for sync, no need to redirect push");
            $ionicPush.plugin.finish(function(){}, function(){}, notId);
          };
        })
        .catch(function(error) {
            $ionicPush.plugin.finish(function(){}, function(){}, notId);
            $ionicPopup.alert({template: JSON.stringify(error)});
        });
    }

    var showDebugLocalNotification = function(message) {
        pushnotify.datacollect.getConfig().then(function(config) {
            if(config.simulate_user_interaction) {
              cordova.plugins.notification.local.schedule({
                  id: 1,
                  title: "Debug javascript notification",
                  text: message,
                  actions: [],
                  category: 'SIGN_IN_TO_CLASS'
              });
            }
        });
    }

    pushnotify.registerNotificationHandler = function() {
      $rootScope.$on('cloud:push:notification', function(event, data) {
        var msg = data.message;
        Logger.log("data = "+JSON.stringify(data));
        if (data.raw.additionalData["content-available"] == 1) {
           redirectSilentPush(event, data);
        }; // else no need to call finish
      });
    };

    $ionicPlatform.ready().then(function() {
      pushnotify.datacollect = $window.cordova.plugins.BEMDataCollection;
      StartPrefs.readConsentState()
        .then(StartPrefs.isConsented)
        .then(function(consentState) {
          if (consentState == true) {
              pushnotify.registerPush();
          } else {
            Logger.log("no consent yet, waiting to sign up for remote push");
          }
        });
      pushnotify.registerNotificationHandler();
      Logger.log("pushnotify startup done");
    });

    $rootScope.$on(StartPrefs.CONSENTED_EVENT, function(event, data) {
      console.log("got consented event "+JSON.stringify(event.name)
                      +" with data "+ JSON.stringify(data));
      if (StartPrefs.isIntroDone()) {
          console.log("intro is done -> reconsent situation, we already have a token -> register");
          pushnotify.registerPush();
      }
    });

    $rootScope.$on(StartPrefs.INTRO_DONE_EVENT, function(event, data) {
          console.log("intro is done -> original consent situation, we should have a token by now -> register");
       pushnotify.registerPush();
    });

    return pushnotify;
});
