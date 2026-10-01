sap.ui.define([
    "./Base.controller",
    "sap/ui/model/json/JSONModel"
], (BaseController, JSONModel) => {
    "use strict";

    // Answers that drive the conditional fields of the view.
    // Yes/No questions use the RadioButtonGroup index: -1 = not answered, 0 = Yes, 1 = No
    const getInitialFormState = () => ({
        q1_1: "",                       // LOADING | DISCHARGE | STS | LOADING_DISCHARGE
        q2_16: "NOT_APPLICABLE",        // NOT_APPLICABLE | OTHERS | <P&I Club>
        q4_7: -1,
        q5_2NotApplicable: false,
        q6_1: -1,
        q6_2: -1,
        q6_6: -1,
        q7_1: -1,
        q8_1: -1,
        q8_8: -1,
        q8_11: -1,
        q8_14c: -1,
        q11_7: -1,
        q11_8: -1
    });

    return BaseController.extend("braskem.zui5vetting.controller.Questionnaire", {
        onInit() {
            this.getView().setModel(new JSONModel(getInitialFormState()), "form")
            this.getRouter().getRoute("RouteCreateQuestionnaires").attachPatternMatched(this.newObject, this)
        },

        newObject() {
            this.getView().getModel("form").setData(getInitialFormState())
        },
        navTo(sRoute) {
            this.getRouter().navTo(sRoute)
        },

    });
});
