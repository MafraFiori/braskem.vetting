sap.ui.define([
    "./Base.controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/core/Element",
    "sap/ui/core/Messaging",
    "sap/ui/core/Fragment",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/library",
    "braskem/zui5vetting/model/fieldFormats",
    "braskem/zui5vetting/model/models"
], (BaseController, JSONModel, Element, Messaging, Fragment, Filter, FilterOperator, mobileLibrary, fieldFormats, models) => {
    "use strict";

    // The form reads two entities: q1> = Questionnaires_1Set (sections 1-6), q2> = Questionnaires_2Set (sections 7-13)
    // Each one has its own deferred group, because Questionnaires_2 can only be sent after the backend generates the IdQuest
    const ENTITIES = {
        // IdQuest is a placeholder, the backend replaces it with the generated number
        q1: { path: "/Questionnaires_1Set", entityType: "Questionnaires_1", groupId: "questionnaire1", properties: { IdQuest: "000000" } },
        q2: { path: "/Questionnaires_2Set", entityType: "Questionnaires_2", groupId: "questionnaire2", properties: {} }
    }

    // Route "RouteQuestionnaire" modes. A copy is a new questionnaire filled with the data of another one
    const MODE = {
        CREATE: "create",
        DISPLAY: "display",
        EDIT: "edit",
        COPY: "copy"
    }

    // Fields not copied to the new questionnaire (the backend fills them)
    const NOT_COPIED = ["__metadata", "IdQuest", "LoginOwner", "StatusQuest", "DtQuest", "HrQuest"]

    // StatusQuest values
    const STATUS = {
        DRAFT: "01",        // Em Edição
        SUBMITTED: "02"     // Enviado
    }

    // Controls checked by the required-field validation
    const FIELD_TYPES = ["sap.m.InputBase", "sap.m.Select", "sap.m.RadioButtonGroup"]

    // Files of the questionnaire (section 14):
    // - path: media entity, used for upload (CREATE_STREAM), download ($value / GET_STREAM) and delete
    // - listPath: same data without media, used to list the files (a media entity set cannot be listed without a content type)
    // Deletes are sent at once (not deferred like the questionnaire changes)
    // - typesPath: document types (code DomvalueL, text Ddtext), used for the "Type" column and the upload dialog
    const FILES = { path: "/Questionnaires_filesSet", listPath: "/FilesSet", typesPath: "/TypeFilesSet", groupId: "files" }

    return BaseController.extend("braskem.zui5vetting.controller.Questionnaire", {

        onInit() {
            const oView = this.getView()
            const oModel = this.getOwnerComponent().getModel()

            // UI-only state, without a field in the entities
            oView.setModel(new JSONModel(), "form")

            oModel.setDeferredGroups([...oModel.getDeferredGroups(), ...Object.values(ENTITIES).map((oEntity) => oEntity.groupId)])
            // Changes of records that already exist (edit, or a draft saved again) go to the same group as the create
            oModel.setChangeGroups(Object.values(ENTITIES).reduce((mGroups, oEntity) => ({
                ...mGroups,
                [oEntity.entityType]: { groupId: oEntity.groupId }
            }), { "*": { groupId: "changes" } }))
            // Same ODataModel under two names, so each entity has its own binding context on the view
            Object.keys(ENTITIES).forEach((sName) => oView.setModel(oModel, sName))

            // Lengths / precision / scale of the fields from the service metadata
            fieldFormats.apply(oView, oModel, Object.fromEntries(Object.entries(ENTITIES).map(([sName, oEntity]) => [sName, oEntity.path.slice(1)])))

            // Opens the MessageView when an error / warning arrives (OData errors, save errors)
            this.attachMessages()

            // Files of section 14: the ones already in the backend + the ones added and not sent yet (pending: true)
            oView.setModel(new JSONModel({ items: [] }), "files")

            this._mContexts = {}
            this.getRouter().getRoute("RouteCreateQuestionnaires").attachPatternMatched(this.newObject, this)
            this.getRouter().getRoute("RouteQuestionnaire").attachPatternMatched(this._onQuestionnaireMatched, this)
        },

        onExit() {
            this.detachMessages()
        },

        newObject() {
            this._resetForm(MODE.CREATE)
            this._createEntries({})
        },

        // Display / edit an existing questionnaire, or copy it into a new one
        async _onQuestionnaireMatched(oEvent) {
            const { IdQuest: sIdQuest, mode: sMode } = oEvent.getParameter("arguments")
            if (![MODE.DISPLAY, MODE.EDIT, MODE.COPY].includes(sMode)) {
                this.navTo("RouteWelcome")
                return
            }

            const oView = this.getView()
            this._resetForm(sMode === MODE.COPY ? MODE.CREATE : sMode)
            Object.keys(ENTITIES).forEach((sName) => this._discardEntity(sName))

            oView.setBusy(true)
            try {
                const mContexts = await this._readEntities(sIdQuest)

                if (sMode === MODE.COPY) {
                    this._createEntries(Object.fromEntries(Object.entries(mContexts).map(([sName, oContext]) => {
                        const oData = { ...oContext?.getObject() }
                        NOT_COPIED.forEach((sField) => delete oData[sField])
                        return [sName, oData]
                    })))
                } else {
                    Object.entries(mContexts).forEach(([sName, oContext]) => {
                        // Part 2 not created yet (draft): empty, created by the next save with the same IdQuest
                        this._mContexts[sName] = oContext || this.getOwnerComponent().getModel().createEntry(ENTITIES[sName].path, {
                            groupId: ENTITIES[sName].groupId,
                            properties: { IdQuest: sIdQuest }
                        })
                        oView.setBindingContext(this._mContexts[sName], sName)
                    })
                    this._loadFiles(sIdQuest)
                }
            } catch {
                // The reason was already added to the messages by the requestFailed handler
                this.navTo("RouteWelcome")
            } finally {
                oView.setBusy(false)
            }
        },

        _resetForm(sMode) {
            this.getView().getModel("form").setData({
                q5_2NotApplicable: false,
                editable: sMode !== MODE.DISPLAY
            })
            this.getView().getModel("files").setData({ items: [] })
            Messaging.removeMessages(this._getValidationMessages())
            this.getView().findAggregatedObjects(true, (oControl) => oControl.isA(FIELD_TYPES))
                .forEach((oField) => this._setFieldError(oField, false))
            this.byId("questionnairePage").scrollToSection(this.byId("questionnairePage").getSections()[0]?.getId(), 0)
        },

        // New records (create / copy). mData: initial values per entity, e.g. { q1: {...}, q2: {...} }
        _createEntries(mData) {
            const oView = this.getView()
            const oModel = this.getOwnerComponent().getModel()

            return oModel.metadataLoaded().then(() => {
                Object.entries(ENTITIES).forEach(([sName, oEntity]) => {
                    this._discardEntity(sName)
                    this._mContexts[sName] = oModel.createEntry(oEntity.path, {
                        groupId: oEntity.groupId,
                        properties: { ...oEntity.properties, ...mData[sName] }
                    })
                    oView.setBindingContext(this._mContexts[sName], sName)
                })
            })
        },

        /**
         * Reads Questionnaires_1 and Questionnaires_2 of the IdQuest from the backend.
         * Part 2 only exists after the first complete save: for a draft ("Em Edição") it may be missing,
         * then q2 is null and no error is shown. For the other status a missing part is an error.
         * @returns {Promise<{q1: sap.ui.model.Context, q2: sap.ui.model.Context|null}>} rejected when not found
         */
        async _readEntities(sIdQuest) {
            const oComponent = this.getOwnerComponent()
            const oModel = oComponent.getModel()
            await oModel.metadataLoaded()

            const read = (oEntity) => new Promise((resolve) => {
                oModel.createBindingContext(oModel.createKey(oEntity.path, { IdQuest: sIdQuest }), null, {}, resolve, true)
            })

            const oContext1 = await read(ENTITIES.q1)
            if (!oContext1) {
                throw new Error(`Questionnaire ${sIdQuest} not found`)
            }

            const bDraft = oContext1.getProperty("StatusQuest") === STATUS.DRAFT
            const fnStopIgnoring = bDraft
                ? oComponent.ignoreRequestFailure(oModel.createKey(ENTITIES.q2.path, { IdQuest: sIdQuest }).slice(1))
                : () => {}
            const oContext2 = await read(ENTITIES.q2)
            fnStopIgnoring()

            if (!oContext2 && !bDraft) {
                throw new Error(`Part 2 of questionnaire ${sIdQuest} not found`)
            }
            return { q1: oContext1, q2: oContext2 }
        },

        // Throws away what was not saved for the entity: a new record not sent, or pending changes of an existing one
        _discardEntity(sName) {
            const oModel = this.getOwnerComponent().getModel()
            const oContext = this._mContexts[sName]
            if (!oContext) {
                return
            }
            if (oContext.isTransient()) {
                oModel.deleteCreatedEntry(oContext)
            } else {
                oModel.resetChanges([oContext.getPath()])
            }
            delete this._mContexts[sName]
        },

        onSaveDraft() {
            if (!this._validateFieldFormats()) {
                return
            }
            return this._save(STATUS.DRAFT)
        },

        onSaveSubmit() {
            if (!this._validateFieldFormats() || !this._validateRequiredFields()) {
                return
            }
            return this._save(STATUS.SUBMITTED)
        },

        // Errors of the field types (invalid number/date, too many digits) raised by the bindings (handleValidation)
        _getValidationMessages() {
            return Messaging.getMessageModel().getData().filter((oMessage) => oMessage.getType() === "Error"
                && oMessage.getMessageProcessor()?.isA("sap.ui.core.message.ControlMessageProcessor"))
        },

        /**
         * Blocks the save while a field has a value the backend would reject: type errors of the bindings
         * (e.g. more integer digits than the Edm.Decimal allows) and Select keys longer than the field (fieldFormats).
         * @returns {boolean} true when all field values are valid
         */
        _validateFieldFormats() {
            const aInvalid = this._getValidationMessages()
                .map((oMessage) => ({ field: Element.getElementById(oMessage.getControlIds()[0]), text: oMessage.getMessage() }))
                .filter((oInvalid) => oInvalid.field && this._isVisible(oInvalid.field))

            this.getView().findAggregatedObjects(true, (oControl) => oControl.isA("sap.m.Select") && oControl.data("maxLength"))
                .filter((oSelect) => oSelect.getSelectedKey().length > oSelect.data("maxLength"))
                .forEach((oSelect) => {
                    const sText = this.getText("questionnaire.msg.keyTooLong", [oSelect.getSelectedKey(), oSelect.data("maxLength")])
                    this._setFieldError(oSelect, true, sText)
                    aInvalid.push({ field: oSelect, text: sText })
                })

            if (!aInvalid.length) {
                return true
            }

            this.addMessage({
                type: "Error",
                title: this.getText("questionnaire.msg.invalidTitle", [aInvalid.length]),
                description: aInvalid.map((oInvalid) => `${this._getFieldLabel(oInvalid.field)}: ${oInvalid.text}`).join("\n")
            })
            this._focusField(aInvalid[0].field)
            return false
        },

        // Text of the Label next to the field (same VBox or table row)
        _getFieldLabel(oField) {
            for (let oParent = oField.getParent(); oParent && oParent !== this.getView(); oParent = oParent.getParent()) {
                const oLabel = oParent.findAggregatedObjects(false, (oControl) => oControl.isA("sap.m.Label"))[0]
                if (oLabel) {
                    return oLabel.getText()
                }
            }
            return ""
        },

        // Questionnaires_1 first (it generates the IdQuest on create), then Questionnaires_2 with that IdQuest.
        // After the first save both records exist, so the next saves send only the changes (MERGE)
        async _save(sStatus) {
            const oView = this.getView()
            const oModel = this.getOwnerComponent().getModel()
            const { q1: oContext1, q2: oContext2 } = this._mContexts

            oView.setBusy(true)
            try {
                oModel.setProperty("StatusQuest", sStatus, oContext1)
                await this._submitEntity("q1")
                const sIdQuest = oContext1.getProperty("IdQuest")

                if (oContext2.isTransient()) {
                    oModel.setProperty("IdQuest", sIdQuest, oContext2)
                }
                await this._submitEntity("q2")

                // 3rd: the files added in section 14, with the same IdQuest
                const bFilesSent = await this._uploadPendingFiles(sIdQuest)
                await this._loadFiles(sIdQuest)

                if (sStatus === STATUS.DRAFT) {
                    this.addMessage({ type: "Success", title: this.getText("questionnaire.msg.draftSaved", [sIdQuest]) })
                } else {
                    // The message stays in the messages button of the list
                    this.addMessage({ type: "Success", title: this.getText("questionnaire.msg.saveSuccess", [sIdQuest]) })
                    // A file not sent stays pending on the screen, so the user can save again
                    if (bFilesSent) {
                        this.navTo("RouteWelcome")
                    }
                }
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

        /**
         * Checks the fields of every visible Label with required="true": the input controls next to the label
         * (same VBox, or same table row). With app:requiredMode="any" on the Label, one filled field is enough.
         * Hidden (conditional) and disabled fields are ignored.
         * @returns {boolean} true when all required fields are filled
         */
        _validateRequiredFields() {
            const oView = this.getView()
            const aMissing = []

            oView.findAggregatedObjects(true, (oControl) => oControl.isA(FIELD_TYPES))
                .forEach((oField) => this._setFieldError(oField, false))

            oView.findAggregatedObjects(true, (oControl) => oControl.isA("sap.m.Label") && oControl.getRequired())
                .filter((oLabel) => this._isVisible(oLabel))
                .forEach((oLabel) => {
                    const aFields = oLabel.getParent().findAggregatedObjects(true, (oControl) => oControl.isA(FIELD_TYPES))
                        .filter((oField) => oField.getEnabled() && this._isVisible(oField))
                    const aEmpty = aFields.filter((oField) => this._isEmpty(oField))
                    const bAny = oLabel.data("requiredMode") === "any"

                    if (aEmpty.length && (!bAny || aEmpty.length === aFields.length)) {
                        const aErrorFields = bAny ? aEmpty.slice(0, 1) : aEmpty
                        aErrorFields.forEach((oField) => this._setFieldError(oField, true))
                        aMissing.push({ label: oLabel.getText(), field: aErrorFields[0] })
                    }
                })

            if (!aMissing.length) {
                return true
            }

            this.addMessage({
                type: "Error",
                title: this.getText("questionnaire.msg.requiredTitle", [aMissing.length]),
                description: aMissing.map((oMissing) => oMissing.label).join("\n")
            })
            this._focusField(aMissing[0].field)
            return false
        },

        _isVisible(oControl) {
            for (let oCurrent = oControl; oCurrent && oCurrent !== this.getView(); oCurrent = oCurrent.getParent()) {
                if (oCurrent.getVisible && !oCurrent.getVisible()) {
                    return false
                }
            }
            return true
        },

        _isEmpty(oField) {
            if (oField.isA("sap.m.RadioButtonGroup")) {
                return oField.getSelectedIndex() < 0
            }
            if (oField.isA("sap.m.Select")) {
                return !oField.getSelectedKey()
            }
            return !oField.getValue().trim()
        },

        // Marks the field in red until the user changes it
        _setFieldError(oField, bError, sText = this.getText("questionnaire.msg.requiredField")) {
            oField.setValueState(bError ? "Error" : "None")
            oField.setValueStateText?.(bError ? sText : "")
            if (bError) {
                const sEvent = oField.isA("sap.m.RadioButtonGroup") ? "select"
                    : oField.isA("sap.m.Select") || oField.isA("sap.m.DatePicker") ? "change" : "liveChange"
                oField.attachEventOnce(sEvent, () => this._setFieldError(oField, false))
            }
        },

        _focusField(oField) {
            let oSection = oField
            while (oSection && !oSection.isA("sap.uxap.ObjectPageSection")) {
                oSection = oSection.getParent()
            }
            if (oSection) {
                this.byId("questionnairePage").scrollToSection(oSection.getId())
            }
            setTimeout(() => oField.focus(), 500)
        },

        // submitChanges calls "success" even when a request inside the $batch fails, so the responses are checked here
        // Nothing is sent when the entity has no pending changes (e.g. a retry after Questionnaires_1 was already saved)
        _submitEntity(sName) {
            const oModel = this.getOwnerComponent().getModel()
            if (!oModel.getPendingChanges()[this._mContexts[sName].getPath().slice(1)]) {
                return Promise.resolve()
            }

            return new Promise((resolve, reject) => {
                oModel.submitChanges({
                    groupId: ENTITIES[sName].groupId,
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

        // ---- Section 14: files (Questionnaires_filesSet) ----
        // Added files stay pending on the screen and are sent when the questionnaire is saved (after parts 1 and 2),
        // with the IdQuest generated by the backend - also for a new questionnaire

        // Files of a saved questionnaire from the backend; the pending ones are kept.
        // The list does not bring the description of the document type: it comes from the document types
        async _loadFiles(sIdQuest) {
            const oFiles = this.getView().getModel("files")
            const aPending = oFiles.getProperty("/items").filter((oFile) => oFile.pending)
            const [aFiles, mTypeTexts] = await Promise.all([this._readFiles(sIdQuest), this._getFileTypeTexts()])

            oFiles.setProperty("/items", [
                ...aFiles.map((oFile) => ({
                    ...oFile,
                    DescrFiletype: oFile.DescrFiletype || mTypeTexts[oFile.Filetype] || oFile.Filetype,
                    pending: false
                })),
                ...aPending
            ])
        },

        _readFiles(sIdQuest) {
            return new Promise((resolve) => {
                this.getOwnerComponent().getModel().read(FILES.listPath, {
                    filters: [new Filter("IdQuest", FilterOperator.EQ, sIdQuest)],
                    success: (oData) => resolve(oData.results),
                    // The reason was already added to the messages by the requestFailed handler
                    error: () => resolve([])
                })
            })
        },

        // Texts of the document types { "01": "...", ... }, read once
        _getFileTypeTexts() {
            if (!this._pFileTypeTexts) {
                this._pFileTypeTexts = new Promise((resolve) => {
                    this.getOwnerComponent().getModel().read(FILES.typesPath, {
                        success: (oData) => resolve(Object.fromEntries(oData.results.map((oType) => [oType.DomvalueL, oType.Ddtext]))),
                        error: () => {
                            this._pFileTypeTexts = null
                            resolve({})
                        }
                    })
                })
            }
            return this._pFileTypeTexts
        },

        /**
         * Sends the pending files as media (POST Questionnaires_filesSet, body = file content), handled by CREATE_STREAM.
         * The other fields go in the "slug" header: IdQuest|Filetype|Filename|Description, each one URI-encoded.
         * @param {string} sIdQuest IdQuest of the saved questionnaire
         * @returns {Promise<boolean>} true when every pending file was sent; the failed ones stay pending
         */
        async _uploadPendingFiles(sIdQuest) {
            const oFiles = this.getView().getModel("files")
            const aPending = oFiles.getProperty("/items").filter((oFile) => oFile.pending)
            if (!aPending.length) {
                return true
            }

            const oModel = this.getOwnerComponent().getModel()
            const sToken = await oModel.securityTokenAvailable()
            const aFailed = []

            for (const oFile of aPending) {
                try {
                    const oResponse = await fetch(oModel.sServiceUrl + FILES.path, {
                        method: "POST",
                        headers: {
                            "x-csrf-token": sToken,
                            slug: [sIdQuest, oFile.Filetype, oFile.Filename, oFile.Descricao].map(encodeURIComponent).join("|"),
                            "Content-Type": oFile.file.type || "application/octet-stream",
                            Accept: "application/json"
                        },
                        body: oFile.file
                    })
                    if (!oResponse.ok) {
                        throw { body: await oResponse.text(), statusCode: oResponse.status, statusText: oResponse.statusText }
                    }
                } catch (oError) {
                    aFailed.push(oFile)
                    this.addMessage({
                        type: "Error",
                        title: this.getText("questionnaire.msg.documentUploadError", [oFile.Filename]),
                        description: models.extractODataErrorMessage(oError) || oError?.message || ""
                    })
                }
            }

            oFiles.setProperty("/items", [...oFiles.getProperty("/items").filter((oFile) => !oFile.pending), ...aFailed])
            if (aPending.length > aFailed.length) {
                this.addMessage({ type: "Success", title: this.getText("questionnaire.msg.documentUploaded", [aPending.length - aFailed.length]) })
            }
            return !aFailed.length
        },

        onAddDocument() {
            if (!this._pUploadDialog) {
                this._pUploadDialog = Fragment.load({
                    id: this.getView().getId(),
                    name: "braskem.zui5vetting.view.fragment.UploadDocumentDialog",
                    controller: this
                }).then((oDialog) => {
                    this.getView().addDependent(oDialog)
                    return oDialog
                })
            }
            this._pUploadDialog.then((oDialog) => {
                this._oSelectedFile = null
                this.byId("uploadFiletype").setSelectedKey("").setValueState("None")
                this.byId("uploadDescription").setValue("")
                this.byId("uploadFile").clear().setValueState("None")
                oDialog.open()
            })
        },

        onFileChange(oEvent) {
            this._oSelectedFile = oEvent.getParameter("files")?.[0] || null
        },

        onCloseUploadDialog() {
            this.byId("uploadDocumentDialog").close()
        },

        // Adds the chosen file to the list as pending. One file per document type (key IdQuest + Filetype)
        onConfirmDocument() {
            const oFiles = this.getView().getModel("files")
            const oFiletype = this.byId("uploadFiletype")
            const sFiletype = oFiletype.getSelectedKey()
            const bDuplicate = oFiles.getProperty("/items").some((oFile) => oFile.Filetype === sFiletype)

            oFiletype.setValueState(!sFiletype || bDuplicate ? "Error" : "None")
                .setValueStateText(bDuplicate ? this.getText("questionnaire.msg.documentTypeExists") : "")
            this.byId("uploadFile").setValueState(this._oSelectedFile ? "None" : "Error")
            if (!sFiletype || bDuplicate || !this._oSelectedFile) {
                return
            }

            oFiles.setProperty("/items", [...oFiles.getProperty("/items"), {
                Filetype: sFiletype,
                DescrFiletype: oFiletype.getSelectedItem().getText(),
                Filename: this._oSelectedFile.name,
                Descricao: this.byId("uploadDescription").getValue(),
                pending: true,
                file: this._oSelectedFile
            }])
            this.byId("uploadDocumentDialog").close()
        },

        // GET_STREAM: the file content is at <entity>/$value
        onDownloadDocument(oEvent) {
            const oModel = this.getOwnerComponent().getModel()
            const oFile = oEvent.getSource().getBindingContext("files").getObject()
            const sPath = oModel.createKey(FILES.path, { IdQuest: oFile.IdQuest, Filetype: oFile.Filetype })
            mobileLibrary.URLHelper.redirect(oModel.sServiceUrl + sPath + "/$value", true)
        },

        // A pending file is only removed from the list; a saved one is deleted in the backend at once
        onDeleteDocument(oEvent) {
            const oFiles = this.getView().getModel("files")
            const oFile = oEvent.getSource().getBindingContext("files").getObject()
            if (oFile.pending) {
                oFiles.setProperty("/items", oFiles.getProperty("/items").filter((oItem) => oItem !== oFile))
                return
            }

            const oModel = this.getOwnerComponent().getModel()
            oModel.remove(oModel.createKey(FILES.path, { IdQuest: oFile.IdQuest, Filetype: oFile.Filetype }), {
                groupId: FILES.groupId,
                success: () => {
                    this.addMessage({ type: "Success", title: this.getText("questionnaire.msg.documentDeleted", [oFile.Filename]) })
                    this._loadFiles(oFile.IdQuest)
                }
            })
        },

        navTo(sRoute) {
            this.getRouter().navTo(sRoute)
        },

    });
});
