sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Fragment",
  "sap/ui/core/EventBus"
], (BaseController, Fragment, EventBus) => {
  "use strict";

  return BaseController.extend("braskem.zui5vetting.controller.Base", {
    getRouter(){
        let router = this.getOwnerComponent().getRouter()
        return router
    },

    getText(sKey, aArgs) {
        return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(sKey, aArgs)
    },

    // ---- Messages (MessageView dialog over the "messages" model of the Component) ----
    // Every message of the app goes to the messages button (no MessageBox / MessageToast)

    addMessage(mMessage) {
        this.getOwnerComponent().addMessage(mMessage)
    },

    // Call in onInit / onExit of the views that have the messages button
    attachMessages() {
        EventBus.getInstance().subscribe("messages", "added", this._onMessageAdded, this)
    },

    detachMessages() {
        EventBus.getInstance().unsubscribe("messages", "added", this._onMessageAdded, this)
    },

    // Errors and warnings open the dialog, only in the view being displayed; success / info just update the button
    _onMessageAdded(sChannel, sEvent, oData) {
        if (!["Error", "Warning"].includes(oData?.message?.type)) {
            return
        }
        const oApp = this.getOwnerComponent().getRootControl()?.byId("app")
        if (oApp && oApp.getCurrentPage() !== this.getView()) {
            return
        }
        this.openMessageDialog()
    },

    // Colour of the messages button: the most severe message type
    formatMessageButtonType(aMessages) {
        const aTypes = (aMessages || []).map((oMessage) => oMessage.type)
        if (aTypes.includes("Error")) {
            return "Negative"
        }
        if (aTypes.includes("Warning")) {
            return "Critical"
        }
        return aTypes.length ? "Success" : "Default"
    },

    onMessagePopoverPress() {
        this.openMessageDialog()
    },

    openMessageDialog() {
        if (!this._pMessageDialog) {
            this._pMessageDialog = Fragment.load({
                id: this.getView().getId(),
                name: "braskem.zui5vetting.view.fragment.MessageDialog",
                controller: this
            }).then((oDialog) => {
                this.getView().addDependent(oDialog)
                return oDialog
            }).catch((oError) => {
                this._pMessageDialog = null
                throw oError
            })
        }

        return this._pMessageDialog.then((oDialog) => {
            this.onMessageBackPress()
            oDialog.open()
        })
    },

    onMessageItemSelect() {
        this.byId("appMessageBackButton").setVisible(true)
        this.byId("appMessageDialogTitle").setText(this.getText("messages.detailsTitle"))
    },

    onMessageBackPress() {
        this.byId("appMessageView").navigateBack()
        this.byId("appMessageBackButton").setVisible(false)
        this.byId("appMessageDialogTitle").setText(this.getText("messages.title"))
    },

    onMessageClearPress() {
        this.getOwnerComponent().clearMessages()
        this.byId("appMessageDialog").close()
    },

    onMessageDialogClosePress() {
        this.byId("appMessageDialog").close()
    }
  });
});
