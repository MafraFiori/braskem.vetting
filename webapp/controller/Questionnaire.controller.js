sap.ui.define([
    "./Base.controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/ui/core/EventBus"
], (BaseController, JSONModel, MessageBox, EventBus) => {
    "use strict";

    // The form reads two entities: q1> = Questionnaires_1Set (sections 1-6), q2> = Questionnaires_2Set (sections 7-13)
    // Each one has its own deferred group, because Questionnaires_2 can only be sent after the backend generates the IdQuest
    const ENTITIES = {
        // IdQuest is a placeholder, the backend replaces it with the generated number
        q1: { path: "/Questionnaires_1Set", groupId: "questionnaire1", properties: { IdQuest: "000000", Quest216: "NA" } },
        q2: { path: "/Questionnaires_2Set", groupId: "questionnaire2", properties: {} }
    }

    return BaseController.extend("braskem.zui5vetting.controller.Questionnaire", {

        onInit() {
            const oView = this.getView()
            const oModel = this.getOwnerComponent().getModel()

            // UI-only state, without a field in the entities
            oView.setModel(new JSONModel({ q5_2NotApplicable: false }), "form")

            oModel.setDeferredGroups([...oModel.getDeferredGroups(), ...Object.values(ENTITIES).map((oEntity) => oEntity.groupId)])
            // Same ODataModel under two names, so each entity has its own binding context on the view
            Object.keys(ENTITIES).forEach((sName) => oView.setModel(oModel, sName))

            // Opens the MessageView whenever a new message arrives (OData errors, save errors)
            EventBus.getInstance().subscribe("messages", "added", this.openMessageDialog, this)

            this._mContexts = {}
            this.getRouter().getRoute("RouteCreateQuestionnaires").attachPatternMatched(this.newObject, this)
        },

        onExit() {
            EventBus.getInstance().unsubscribe("messages", "added", this.openMessageDialog, this)
        },

        newObject() {
            const oView = this.getView()
            const oModel = this.getOwnerComponent().getModel()

            oView.getModel("form").setData({ q5_2NotApplicable: false })

            oModel.metadataLoaded().then(() => {
                Object.entries(ENTITIES).forEach(([sName, oEntity]) => {
                    if (this._mContexts[sName]?.isTransient()) {
                        oModel.deleteCreatedEntry(this._mContexts[sName])
                    }
                    this._mContexts[sName] = oModel.createEntry(oEntity.path, {
                        groupId: oEntity.groupId,
                        properties: { ...oEntity.properties }
                    })
                    oView.setBindingContext(this._mContexts[sName], sName)
                })
            })
        },

        async onSaveSubmit() {
            const oView = this.getView()
            const oModel = this.getOwnerComponent().getModel()
            const { q1: oContext1, q2: oContext2 } = this._mContexts

            oView.setBusy(true)
            try {
                // 1st: Questionnaires_1, which generates the IdQuest. Skipped on a retry, when it was already saved
                if (oContext1.isTransient()) {
                    await this._submitGroup(ENTITIES.q1.groupId)
                }
                const sIdQuest = oContext1.getProperty("IdQuest")

                // 2nd: Questionnaires_2 with the generated IdQuest
                oModel.setProperty("IdQuest", sIdQuest, oContext2)
                await this._submitGroup(ENTITIES.q2.groupId)

                MessageBox.success(this.getText("questionnaire.msg.saveSuccess", [sIdQuest]), {
                    onClose: () => this.navTo("RouteWelcome")
                })
            } catch (oError) {
                // Failed OData requests are already added by the requestFailed handler (models.attachErrorHandling)
                if (!oError?.response && !oError?.statusCode) {
                    this.addMessage({
                        type: "Error",
                        title: this.getText("questionnaire.msg.saveError"),
                        description: oError?.message || ""
                    })
                }
            } finally {
                oView.setBusy(false)
            }
        },

        // submitChanges calls "success" even when a request inside the $batch fails, so the responses are checked here
        _submitGroup(sGroupId) {
            const oModel = this.getOwnerComponent().getModel()

            return new Promise((resolve, reject) => {
                oModel.submitChanges({
                    groupId: sGroupId,
                    success: (oData) => {
                        const oFailed = (oData?.__batchResponses || []).find((oResponse) => Number(oResponse.response?.statusCode) >= 400)
                        if (oFailed) {
                            reject(oFailed)
                        } else {
                            resolve(oData)
                        }
                    },
                    error: reject
                })
            })
        },


        navTo(sRoute) {
            this.getRouter().navTo(sRoute)
        },

    });
});
