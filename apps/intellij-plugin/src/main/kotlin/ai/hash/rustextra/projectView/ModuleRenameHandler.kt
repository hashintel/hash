package ai.hash.rustextra.projectView

import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.actionSystem.DataContext
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.refactoring.rename.RenameHandler

class ModuleRenameHandler: RenameHandler {
    override fun invoke(project: Project, editor: Editor?, file: PsiFile?, dataContext: DataContext?) {
        println("INVOKE (big)")
        println(project);
        println(file)
        println(dataContext)
        TODO("Not yet implemented")
    }

    override fun invoke(project: Project, elements: Array<out PsiElement>, dataContext: DataContext?) {
        println("INVOKE (small)")
        println(project);

        for (element in elements) {
            if (element is ModuleNode) {

            }
        }

        elements.map { (element) ->
            if (element is )
        }

        println(elements)
        println(dataContext)
        TODO("Not yet implemented")
    }

    override fun isAvailableOnDataContext(dataContext: DataContext): Boolean {
        val file = CommonDataKeys.PSI_FILE.getData(dataContext);
        println(file);

        // available on files that end with .rs
        // for now just PSI_FILE in the future we'd want something better
        return file != null
    }
}