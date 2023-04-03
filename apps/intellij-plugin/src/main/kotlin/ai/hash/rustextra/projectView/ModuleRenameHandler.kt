package ai.hash.rustextra.projectView

import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.refactoring.RefactoringActionHandlerFactory
import com.intellij.refactoring.rename.RenameHandler

class ModuleRenameHandler: RenameHandler {
    override fun invoke(project: Project, editor: Editor?, file: PsiFile?, dataContext: DataContext?) {
        if (dataContext == null) {
            return;
        }

        val files = ModuleFile.DATA_KEY.getData(dataContext)

        if (files == null || files.size != 1) return;

        RefactoringActionHandlerFactory.getInstance().createRenameHandler().invoke(project,
            files.toTypedArray(), dataContext)
    }

    override fun invoke(project: Project, elements: Array<out PsiElement>, dataContext: DataContext?) {
        invoke(project, null, null, dataContext)
    }

    override fun isAvailableOnDataContext(dataContext: DataContext): Boolean {
        val files = ModuleFile.DATA_KEY.getData(dataContext);

        return !files.isNullOrEmpty()
    }
}