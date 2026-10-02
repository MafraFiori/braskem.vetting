sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/Fragment"
], (BaseController, Fragment) => {
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

    addMessage(mMessage) {
        this.getOwnerComponent().addMessage(mMessage)
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
