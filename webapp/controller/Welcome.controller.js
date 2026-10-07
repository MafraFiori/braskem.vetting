sap.ui.define([
    "./Base.controller"
], (Controller) => {
    "use strict";

    return Controller.extend("braskem.zui5vetting.controller.Welcome", {

        onInit() {
            this.getRouter().getRoute("RouteWelcome").attachPatternMatched(this._onWelcomeMatched, this)
        },

        _onWelcomeMatched() {
            const oSmartTable = this.byId("smartTable")
            if (oSmartTable.isInitialised()) {
                oSmartTable.rebindTable()
            }
        },

        onRefreshPage(oEvent) {
            let SmartTable = this.getView().byId("smartTable")
            SmartTable.rebindTable()
        },

        onCreateQuestionnaires(oEvent) {
            this.getRouter().navTo("RouteCreateQuestionnaires")
        },

        onDisplayQuestionnaire(oEvent) {
            this._navToQuestionnaire(oEvent, "display")
        },

        onEditQuestionnaire(oEvent) {
            this._navToQuestionnaire(oEvent, "edit")
        },

        onCopyQuestionnaire(oEvent) {
            this._navToQuestionnaire(oEvent, "copy")
        },

        // Translated status text (i18n "status.<code>"); unknown codes show the backend description
        formatStatusText(sStatus, sDescription) {
            const sKey = `status.${sStatus}`
            const oBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle()
            return oBundle.hasText(sKey) ? oBundle.getText(sKey) : (sDescription || sStatus || "")
        },

        _navToQuestionnaire(oEvent, sMode) {
            const sIdQuest = oEvent.getSource().getBindingContext().getProperty("IdQuest")
            this.getRouter().navTo("RouteQuestionnaire", { IdQuest: sIdQuest, mode: sMode })
        }

    });
});