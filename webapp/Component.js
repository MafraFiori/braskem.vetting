sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/core/EventBus",
    "sap/ui/model/json/JSONModel",
    "braskem/zui5vetting/model/models"
], (UIComponent, EventBus, JSONModel, models) => {
    "use strict";

    return UIComponent.extend("braskem.zui5vetting.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ],
            config: { fullWidth: true }
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // app messages, shown by the MessageView dialog
            this._aRecentMessageKeys = []
            this._aIgnoredRequests = []
            this.setModel(new JSONModel({ messages: [] }), "messages")
            models.attachErrorHandling(this.getModel(), this)

            // enable routing
            this.getRouter().initialize();
        },

        /**
         * Adds a message to the central "messages" model and notifies the views ("messages" / "added" on the EventBus).
         * The same message received again within 3 seconds is ignored.
         * @param {object} mMessage { type, title, description }
         */
        addMessage(mMessage) {
            const sKey = [mMessage.type, mMessage.title, mMessage.description].join("|")
            const iNow = Date.now()

            this._aRecentMessageKeys = this._aRecentMessageKeys.filter((oEntry) => (iNow - oEntry.time) < 3000)
            if (this._aRecentMessageKeys.some((oEntry) => oEntry.key === sKey)) {
                return
            }
            this._aRecentMessageKeys.push({ key: sKey, time: iNow })

            const oMessagesModel = this.getModel("messages")
            const oNewMessage = {
                type: mMessage.type || "Error",
                title: mMessage.title || "",
                description: mMessage.description || "",
                date: new Date().toLocaleString()
            }
            oMessagesModel.setProperty("/messages", [oNewMessage, ...oMessagesModel.getProperty("/messages")])

            EventBus.getInstance().publish("messages", "added", { message: oNewMessage })
        },

        /**
         * Failure of a request that the caller expects and handles (e.g. part 2 not created yet): not added to the messages.
         * @param {string} sUrlPart part of the request URL, e.g. "Questionnaires_2Set('005988')"
         * @returns {function} call it when the request is finished, to stop ignoring
         */
        ignoreRequestFailure(sUrlPart) {
            this._aIgnoredRequests.push(sUrlPart)
            return () => {
                this._aIgnoredRequests = this._aIgnoredRequests.filter((sIgnored) => sIgnored !== sUrlPart)
            }
        },

        isRequestFailureIgnored(sUrl) {
            return this._aIgnoredRequests.some((sIgnored) => (sUrl || "").includes(sIgnored))
        },

        clearMessages() {
            this.getModel("messages").setProperty("/messages", [])
        }
    });
});
