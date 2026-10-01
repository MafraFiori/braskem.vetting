sap.ui.define([
    "./Base.controller"
], (BaseController) => {
    "use strict";

    return BaseController.extend("braskem.zui5vetting.controller.Questionnaire", {
        onInit() {
            this.getRouter().getRoute("RouteCreateQuestionnaires").attachPatternMatched(this.newObject, this)
        },

        newObject() { },
        navTo(sRoute) {
            this.getRouter().navTo(sRoute)
        },

    });
});