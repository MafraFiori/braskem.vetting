sap.ui.define([
    "./Base.controller"
], (Controller) => {
    "use strict";

    return Controller.extend("braskem.zui5vetting.controller.Welcome", {

        onInit() {},

        onRefreshPage(oEvent) {
            let SmartTable = this.getView().byId("smartTable")
            SmartTable.rebindTable()
        },

        onCreateQuestionnaires(oEvent) {
            this.getRouter().navTo("RouteCreateQuestionnaires")
        }

    });
});