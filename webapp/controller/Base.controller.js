sap.ui.define([
  "sap/ui/core/mvc/Controller",
], (BaseController) => {
  "use strict";

  return BaseController.extend("braskem.zui5vetting.controller.Base", {
    getRouter(){
        let router = this.getOwnerComponent().getRouter()
        return router
    }
  });
});